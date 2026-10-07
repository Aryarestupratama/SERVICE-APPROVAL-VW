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
        $sortMap = ['plate_number' => ['plate_number'], 'brand_model' => ['brand', 'model'], 'vin' => ['vin']];
        $sortCols = $sortMap[$request->string('sort_by')->toString()] ?? null;
        $sortDir = $request->string('sort_dir')->toString() === 'desc' ? 'desc' : 'asc';

        $vehicles = Vehicle::query()
            ->with(['customer', 'customers'])
            ->when($request->search, fn ($q, $search) =>
                // Dibungkus grup supaya filter brand tidak ikut ter-OR.
                $q->where(fn ($w) => $w
                    ->where('plate_number', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('vin', 'like', "%{$search}%")
                    ->orWhereHas('customers', fn ($q2) =>
                        $q2->where('name', 'like', "%{$search}%")
                    ))
            )
            ->when($request->brand, fn ($q, $brand) =>
                $q->where('brand', $brand)
            )
            ->when($sortCols, function ($q) use ($sortCols, $sortDir) {
                foreach ($sortCols as $col) {
                    $q->orderBy($col, $sortDir);
                }
                $q->orderBy('id');
            }, fn ($q) => $q->latest())
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Admin/Vehicles/Index', [
            'vehicles' => $vehicles,
            'search' => $request->search,
            'filters' => $request->only(['brand', 'sort_by', 'sort_dir']),
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
        // Guard aplikasi: FK service_orders.vehicle_id adalah cascadeOnDelete, jadi
        // tanpa cek ini menghapus kendaraan ikut menghapus SEMUA order & itemnya.
        if ($vehicle->serviceOrders()->exists()) {
            return back()->with(
                'error',
                'Vehicle cannot be deleted because it still has related service orders.'
            );
        }

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
        if ($request->filled('plate_number')) {
            $request->merge(['plate_number' => strtoupper(preg_replace('/\s+/', '', (string) $request->input('plate_number')))]);
        }

        return $request->validate([
            'plate_number' => ['required', 'string', 'max:20'],
            'brand' => ['required', Rule::in(Vehicle::BRANDS)],
            'vin' => [
                'required',
                'string',
                'size:17',
                $vehicle
                    ? Rule::unique('vehicles', 'vin')->ignore($vehicle->id)
                    : 'unique:vehicles,vin',
            ],
            'model' => ['required', 'string', 'max:100'],
            'customer_ids' => [
                'required',
                'array',
                'min:1',
                function ($attribute, $value, $fail) {
                    if (count($value) !== count(array_unique($value))) {
                        $fail('Terdapat customer yang dipilih lebih dari sekali.');
                    }
                },
            ],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'primary_customer_id' => [
                'required',
                'integer',
                'exists:customers,id',
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