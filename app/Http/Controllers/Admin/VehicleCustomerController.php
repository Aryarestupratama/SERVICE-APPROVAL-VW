<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerVehicle;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Inertia\Inertia;

class VehicleCustomerController extends Controller
{
    public function index(Request $request)
    {
        $sortBy = $request->string('sort_by')->toString();
        $sortDir = $request->string('sort_dir')->toString() === 'desc' ? 'desc' : 'asc';

        $pivots = CustomerVehicle::query()
            ->with(['customer', 'vehicle'])
            ->when($request->search, fn ($q, $search) =>
                // Dibungkus grup supaya filter role tidak ikut ter-OR.
                $q->where(fn ($w) => $w
                    ->whereHas('customer', fn ($q2) => $q2->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('vehicle', fn ($q2) =>
                        $q2->where('plate_number', 'like', "%{$search}%")
                            ->orWhere('vin', 'like', "%{$search}%")
                    ))
            )
            ->when($request->role, fn ($q, $role) =>
                $q->where('is_primary', $role === 'primary')
            )
            ->when(in_array($sortBy, ['vehicle', 'customer', 'role'], true), function ($q) use ($sortBy, $sortDir) {
                if ($sortBy === 'vehicle') {
                    $q->orderBy(Vehicle::select('plate_number')->whereColumn('vehicles.id', 'customer_vehicle.vehicle_id'), $sortDir);
                } elseif ($sortBy === 'customer') {
                    $q->orderBy(Customer::select('name')->whereColumn('customers.id', 'customer_vehicle.customer_id'), $sortDir);
                } else {
                    $q->orderBy('is_primary', $sortDir);
                }
                $q->orderBy('id');
            }, fn ($q) => $q->latest())
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Admin/VehicleCustomers/Index', [
            'pivots' => $pivots,
            'search' => $request->search,
            'filters' => $request->only(['role', 'sort_by', 'sort_dir']),
            'vehicles' => Vehicle::select('id', 'plate_number', 'vin', 'brand', 'model')
                ->orderBy('plate_number')->get(),
            'customers' => Customer::select('id', 'name')->orderBy('name')->get(),
        ]);
    }

    /**
     * Assign customer ke vehicle. is_primary default false — kalau admin
     * mau langsung jadikan primary, dilakukan lewat aksi "Set as Primary"
     * terpisah setelah assign (konsisten dengan pola syncVehicleCustomers
     * di VehicleController: primary di-set PALING TERAKHIR).
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'vehicle_id' => ['required', 'integer', 'exists:vehicles,id'],
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
        ]);

        $exists = CustomerVehicle::where('vehicle_id', $validated['vehicle_id'])
            ->where('customer_id', $validated['customer_id'])
            ->exists();

        if ($exists) {
            return back()->with('error', 'This customer is already linked to this vehicle.');
        }

        CustomerVehicle::create([
            'vehicle_id' => $validated['vehicle_id'],
            'customer_id' => $validated['customer_id'],
            'is_primary' => false,
        ]);

        return back()->with('success', 'Customer linked to vehicle.');
    }

    /**
     * update() bukan create()/delete() — WAJIB, supaya CustomerVehicleObserver
     * ter-trigger (un-primary-kan pivot lain di vehicle yang sama + sync
     * vehicles.customer_id). Sama pola dengan syncVehicleCustomers() di
     * VehicleController.
     */
    public function setPrimary(CustomerVehicle $customerVehicle)
    {
        $customerVehicle->update(['is_primary' => true]);

        return back()->with('success', 'Primary customer updated.');
    }

    /**
     * Guard: vehicle wajib punya minimal 1 customer — cegah unassign kalau
     * ini satu-satunya pivot yang tersisa untuk vehicle tersebut.
     */
    public function destroy(CustomerVehicle $customerVehicle)
    {
        $remaining = CustomerVehicle::where('vehicle_id', $customerVehicle->vehicle_id)->count();

        if ($remaining <= 1) {
            return back()->with('error', 'Cannot unassign: this vehicle must keep at least one customer.');
        }

        $customerVehicle->delete();

        return back()->with('success', 'Customer unassigned from vehicle.');
    }
}