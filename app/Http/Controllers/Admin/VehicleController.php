<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use App\Models\Customer;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Inertia\Inertia;

class VehicleController extends Controller
{
    public function index(Request $request)
    {
        $vehicles = Vehicle::query()
            ->with('customer')
            ->when($request->search, fn ($q, $search) =>
                $q->where('plate_number', 'like', "%{$search}%")
                  ->orWhere('model', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($q2) =>
                      $q2->where('name', 'like', "%{$search}%")
                  )
            )
            ->latest()
            ->paginate(20);

        return Inertia::render('Admin/Vehicles/Index', [
            'vehicles' => $vehicles,
            'search' => $request->search,
            // Dropdown pilih customer di form tambah/edit kendaraan
            'customers' => Customer::select('id', 'name')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'plate_number' => ['required', 'string', 'max:20'],
            'brand' => ['nullable', 'string', 'max:100'],
            'model' => ['required', 'string', 'max:100'],
            'year' => ['nullable', 'integer', 'min:1980', 'max:' . (date('Y') + 1)],
        ]);

        $vehicle = Vehicle::create($validated);

        return back()->with('success', 'Kendaraan berhasil ditambahkan.')->with('vehicle', $vehicle);
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $validated = $request->validate([
            'plate_number' => ['required', 'string', 'max:20'],
            'brand' => ['nullable', 'string', 'max:100'],
            'model' => ['required', 'string', 'max:100'],
            'year' => ['nullable', 'integer', 'min:1980', 'max:' . (date('Y') + 1)],
        ]);

        $vehicle->update($validated);

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
}