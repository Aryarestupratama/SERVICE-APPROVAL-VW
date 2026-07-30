<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class ServiceOrderController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $query = ServiceOrder::with(['vehicle.customer', 'serviceAdvisor']);

        if ($user->role === 'service_advisor') {
            $query->where('service_advisor_id', $user->id);
        }

        return Inertia::render('Admin/ServiceOrders/Index', [
            'orders' => $query->latest()->paginate(20),
        ]);
    }

    public function show(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $serviceOrder->load(['vehicle.customer', 'serviceAdvisor', 'technician', 'videos', 'inspectionItems', 'invoice']);

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
        ]);
    }

    public function updateStatus(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Hanya admin & SA yang bisa sampai sini (dijamin middleware route),
        // teknisi tidak punya akun login jadi tidak perlu cabang logic terpisah
        $validated = $request->validate([
            'status' => ['required', Rule::in([
                'approved', 'in_progress', 'completed', 'invoiced',
            ])],
        ]);

        $serviceOrder->update(['status' => $validated['status']]);

        return back()->with('success', 'Status berhasil diperbarui.');
    }

    /**
     * Cek SA/teknisi hanya bisa akses order miliknya sendiri.
     * Admin selalu lolos.
     */
    private function authorizeAccess(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            return;
        }

        if ($user->role === 'service_advisor' && $serviceOrder->service_advisor_id === $user->id) {
            return;
        }

        abort(403, 'Anda tidak punya akses ke service order ini.');
    }
}