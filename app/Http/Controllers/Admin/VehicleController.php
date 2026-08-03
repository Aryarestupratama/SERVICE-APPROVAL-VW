<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use App\Models\Customer;
use App\Models\CustomerVehicle;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class VehicleController extends Controller
{
    public function index(Request $request)
    {
        $vehicles = Vehicle::query()
            // 'customer' = shortcut primary (dipertahankan untuk kompatibilitas tampilan lama)
            // 'customers' = daftar lengkap PIC (untuk kebutuhan tampilan multi-customer nanti)
            ->with(['customer', 'customers'])
            ->when($request->search, fn ($q, $search) =>
                $q->where('plate_number', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('vin', 'like', "%{$search}%")
                    ->orWhereHas('customers', fn ($q2) =>
                        $q2->where('name', 'like', "%{$search}%")
                    )
            )
            ->latest()
            ->paginate(20);

        return Inertia::render('Admin/Vehicles/Index', [
            'vehicles' => $vehicles,
            'search' => $request->search,
            'customers' => Customer::select('id', 'name')->orderBy('name')->get(),
            'brands' => Vehicle::BRANDS,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateVehicle($request);

        $vehicle = DB::transaction(function () use ($validated) {
            // customer_id di tabel vehicles sengaja dibiarkan null saat create —
            // akan otomatis terisi oleh CustomerVehicleObserver saat pivot primary disimpan.
            $vehicle = Vehicle::create([
                'plate_number' => $validated['plate_number'],
                'brand' => $validated['brand'],
                'vin' => $validated['vin'],
                'model' => $validated['model'],
                'year' => $validated['year'] ?? null,
            ]);

            $this->syncVehicleCustomers(
                $vehicle,
                $validated['customer_ids'],
                $validated['primary_customer_id']
            );

            return $vehicle;
        });

        return back()->with('success', 'Kendaraan berhasil ditambahkan.')->with('vehicle', $vehicle);
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $validated = $this->validateVehicle($request, $vehicle);

        DB::transaction(function () use ($validated, $vehicle) {
            $vehicle->update([
                'plate_number' => $validated['plate_number'],
                'brand' => $validated['brand'],
                'vin' => $validated['vin'],
                'model' => $validated['model'],
                'year' => $validated['year'] ?? null,
            ]);

            $this->syncVehicleCustomers(
                $vehicle,
                $validated['customer_ids'],
                $validated['primary_customer_id']
            );
        });

        return back()->with('success', 'Kendaraan berhasil diperbarui.');
    }

    public function destroy(Vehicle $vehicle)
    {
        try {
            $vehicle->delete();
        } catch (QueryException $e) {
            return back()->with(
                'error',
                'Vehicle cannot be deleted because it still has related service orders.'
            );
        }

        return back()->with('success', 'Kendaraan berhasil dihapus.');
    }

    /**
     * Validasi bersama store() & update(). primary_customer_id WAJIB
     * ada di dalam customer_ids (custom rule 'in_array').
     */
    private function validateVehicle(Request $request, ?Vehicle $vehicle = null): array
    {
        return $request->validate([
            'plate_number' => ['required', 'string', 'max:20'],
            'brand' => ['required', Rule::in(Vehicle::BRANDS)],
            'vin' => [
                'required', 'string', 'size:17',
                $vehicle
                    ? Rule::unique('vehicles', 'vin')->ignore($vehicle->id)
                    : 'unique:vehicles,vin',
            ],
            'model' => ['required', 'string', 'max:100'],
            'year' => ['nullable', 'integer', 'min:1980', 'max:' . (date('Y') + 1)],
            'customer_ids' => ['required', 'array', 'min:1'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'primary_customer_id' => [
                'required', 'integer', 'exists:customers,id',
                function ($attribute, $value, $fail) use ($request) {
                    if (! in_array($value, $request->input('customer_ids', []))) {
                        $fail('Primary customer harus salah satu dari customer yang dipilih.');
                    }
                },
            ],
        ]);
    }

    /**
     * Sinkronkan pivot customer_vehicle secara MANUAL (bukan sync()/attach()/detach()
     * bawaan belongsToMany) supaya CustomerVehicleObserver tetap ter-trigger dengan
     * benar (observer bergantung pada Eloquent model events saved()/deleted(), yang
     * TIDAK dipicu oleh method sync()/attach()/detach() bawaan Laravel karena itu
     * langsung query insert/delete tanpa membuat instance model).
     *
     * Urutan penting: primary di-set PALING TERAKHIR, supaya observer yang
     * "un-primary-kan pivot lain" jalan setelah semua pivot final sudah ada.
     */
    private function syncVehicleCustomers(Vehicle $vehicle, array $customerIds, int $primaryCustomerId): void
    {
        $existing = CustomerVehicle::where('vehicle_id', $vehicle->id)
            ->get()
            ->keyBy('customer_id');

        // 1. Hapus pivot untuk customer yang tidak lagi dipilih.
        //    Delete() memicu observer (fallback reassign primary kalau yang dihapus
        //    kebetulan primary) — aman karena akan di-override di langkah 3.
        foreach ($existing as $customerId => $pivot) {
            if (! in_array($customerId, $customerIds)) {
                $pivot->delete();
            }
        }

        // 2. Tambah pivot baru untuk customer yang belum terhubung.
        //    is_primary sengaja false dulu di sini.
        foreach ($customerIds as $customerId) {
            if (! $existing->has($customerId)) {
                CustomerVehicle::create([
                    'vehicle_id' => $vehicle->id,
                    'customer_id' => $customerId,
                    'is_primary' => false,
                ]);
            }
        }

        // 3. Set primary — memicu observer untuk un-primary-kan pivot lain
        //    dan sinkronkan vehicles.customer_id.
        CustomerVehicle::where('vehicle_id', $vehicle->id)
            ->where('customer_id', $primaryCustomerId)
            ->firstOrFail()
            ->update(['is_primary' => true]);
    }
}