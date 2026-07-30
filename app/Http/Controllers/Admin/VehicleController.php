<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use Illuminate\Http\Request;

class VehicleController extends Controller
{
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
}