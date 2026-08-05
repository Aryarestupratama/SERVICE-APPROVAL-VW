<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InspectionItem;
use Inertia\Inertia;

class DashboardPartController extends Controller
{
    public function index()
    {
        $items = InspectionItem::select('name', 'status', 'final_price_snapshot')->get();

        $grouped = $items->groupBy('name')->map(function ($group, $name) {
            $approved = $group->where('status', 'approved');
            $rejected = $group->where('status', 'rejected');
            $decidedCount = $approved->count() + $rejected->count();

            return [
                'name' => $name,
                'used_count' => $group->count(),
                'revenue' => (float) $approved->sum('final_price_snapshot'),
                'approved_count' => $approved->count(),
                'rejected_count' => $rejected->count(),
                'reject_rate' => $decidedCount > 0
                    ? round($rejected->count() / $decidedCount * 100, 1)
                    : null,
            ];
        })->values()->sortByDesc('used_count')->values();

        $mostRejected = $grouped->sortByDesc('rejected_count')->first();

        return Inertia::render('Admin/Dashboards/Part', [
            'partStats' => $grouped,
            'summary' => [
                'total_used' => $grouped->sum('approved_count'),
                'total_revenue' => $grouped->sum('revenue'),
                'most_rejected_name' => ($mostRejected && $mostRejected['rejected_count'] > 0)
                    ? $mostRejected['name']
                    : '—',
            ],
        ]);
    }
}