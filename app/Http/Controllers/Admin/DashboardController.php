<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();

        $query = ServiceOrder::with(['vehicle.customer', 'serviceAdvisor', 'technician']);

        if ($user->role === 'service_advisor') {
            $query->where('service_advisor_id', $user->id);
        }
        // admin tidak difilter, lihat semua

        $orders = $query->latest()->get()->groupBy('status');

        return Inertia::render('Admin/Dashboard', [
            'ordersByStatus' => $orders,
        ]);
    }
}