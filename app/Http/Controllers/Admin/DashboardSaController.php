<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InspectionItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class DashboardSaController extends Controller
{
    public function index(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);

        $serviceAdvisors = User::where('role', 'service_advisor')->get();

        $stats = $serviceAdvisors->map(function (User $sa) use ($from, $to) {
            $orderQuery = $sa->serviceOrders()
                ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
                ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to));

            $orderCount = $orderQuery->count();

            $items = InspectionItem::whereHas('serviceOrder', function ($q) use ($sa, $from, $to) {
                $q->where('service_advisor_id', $sa->id)
                    ->when($from, fn ($q2) => $q2->whereDate('created_at', '>=', $from))
                    ->when($to, fn ($q2) => $q2->whereDate('created_at', '<=', $to));
            });

            $approvedCount = (clone $items)->where('status', 'approved')->count();
            $rejectedCount = (clone $items)->where('status', 'rejected')->count();
            $decidedCount = $approvedCount + $rejectedCount;
            $revenue = (clone $items)->where('status', 'approved')->sum('final_price_snapshot');

            return [
                'id' => $sa->id,
                'name' => $sa->name,
                'order_count' => $orderCount,
                'revenue' => (float) $revenue,
                'approved_count' => $approvedCount,
                'rejected_count' => $rejectedCount,
                'approve_rate' => $decidedCount > 0 ? round($approvedCount / $decidedCount * 100, 1) : null,
                'reject_rate' => $decidedCount > 0 ? round($rejectedCount / $decidedCount * 100, 1) : null,
            ];
        })->values();

        $totalApproved = $stats->sum('approved_count');
        $totalRejected = $stats->sum('rejected_count');
        $totalDecided = $totalApproved + $totalRejected;

        return Inertia::render('Admin/Dashboards/Sa', [
            'saStats' => $stats,
            'summary' => [
                'total_orders' => $stats->sum('order_count'),
                'total_revenue' => $stats->sum('revenue'),
                'overall_approve_rate' => $totalDecided > 0
                    ? round($totalApproved / $totalDecided * 100, 1)
                    : null,
            ],
            'filters' => [
                'period_mode' => $request->input('period_mode', 'preset'),
                'period_preset' => $request->input('period_preset', 'all'),
                'period_from' => $request->input('period_from'),
                'period_to' => $request->input('period_to'),
            ],
        ]);
    }

    /** Basis filter: created_at ServiceOrder (keputusan owner). */
    private function resolveDateRange(Request $request): array
    {
        $mode = $request->input('period_mode', 'preset');

        if ($mode === 'range') {
            $from = $request->input('period_from') ? Carbon::parse($request->input('period_from')) : null;
            $to = $request->input('period_to') ? Carbon::parse($request->input('period_to')) : null;
            return [$from, $to];
        }

        $preset = $request->input('period_preset', 'all');

        $from = match ($preset) {
            '7d' => Carbon::now()->subDays(7),
            '30d' => Carbon::now()->subDays(30),
            '1y' => Carbon::now()->subYear(),
            default => null, // 'all'
        };

        return [$from, $preset === 'all' ? null : Carbon::now()];
    }
}