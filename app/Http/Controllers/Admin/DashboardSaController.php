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

        // Kontribusi rupiah 1 item — Part + Labour, masing-masing dikurangi
        // diskonnya sendiri. Sama definisinya dengan itemContribution() di
        // InspectionItemPricingService (PHP) / Show.jsx & InspectionReport.jsx
        // (JS), dan sudah dipakai juga di DashboardPartController — lihat
        // PROJECT-RULES bagian 1. Dipakai untuk item rejected (tidak pernah
        // punya final_price_snapshot karena tidak pernah di-lock).
        $contribution = function (InspectionItem $item) {
            $itemPrice = (float) $item->cost_item * (1 - ((float) ($item->discount_item_percent ?? 0)) / 100);
            $labourPrice = (float) $item->cost_labour * (1 - ((float) ($item->discount_labour_percent ?? 0)) / 100);

            return $itemPrice + $labourPrice;
        };

        $stats = $serviceAdvisors->map(function (User $sa) use ($from, $to, $contribution) {
            $orderQuery = $sa->serviceOrders()
                ->when($from, fn ($q) => $q->whereDate('created_at', '>=', $from))
                ->when($to, fn ($q) => $q->whereDate('created_at', '<=', $to));

            $orderCount = (clone $orderQuery)->count();

            // Status keseluruhan per SERVICE ORDER (bukan per item) — dari
            // kolom items_approval_status (ServiceOrder::computeApprovalStatus(),
            // lihat PROJECT-RULES bagian 1). "rejected" sengaja tidak dihitung
            // di sini (keputusan owner: kasusnya jarang terjadi).
            $approvedOrderCount = (clone $orderQuery)->where('items_approval_status', 'approved')->count();
            $partiallyApprovedOrderCount = (clone $orderQuery)
                ->where('items_approval_status', 'partially_approved')
                ->count();

            $items = InspectionItem::whereHas('serviceOrder', function ($q) use ($sa, $from, $to) {
                $q->where('service_advisor_id', $sa->id)
                    ->when($from, fn ($q2) => $q2->whereDate('created_at', '>=', $from))
                    ->when($to, fn ($q2) => $q2->whereDate('created_at', '<=', $to));
            })->get([
                'status',
                'cost_item',
                'cost_labour',
                'discount_item_percent',
                'discount_labour_percent',
                'final_price_snapshot',
            ]);

            $approvedItems = $items->where('status', 'approved');
            $rejectedItems = $items->where('status', 'rejected');
            $decidedCount = $approvedItems->count() + $rejectedItems->count();

            // Item approved sudah locked (final_price_snapshot terisi) — pakai
            // snapshot itu, bukan recompute, supaya konsisten dengan Grand
            // Total di Show.jsx/InspectionReport.jsx. Fallback ke
            // $contribution() cuma jaga-jaga kalau ada data approved lama
            // yang snapshot-nya kosong.
            $revenueApproved = $approvedItems->sum(
                fn (InspectionItem $item) => $item->final_price_snapshot !== null
                    ? (float) $item->final_price_snapshot
                    : $contribution($item)
            );

            $revenueRejected = $rejectedItems->sum($contribution);

            return [
                'id' => $sa->id,
                'name' => $sa->name,
                'order_count' => $orderCount,
                'approved_order_count' => $approvedOrderCount,
                'partially_approved_order_count' => $partiallyApprovedOrderCount,
                'revenue_approved' => (float) $revenueApproved,
                'revenue_rejected' => (float) $revenueRejected,
                'approved_count' => $approvedItems->count(),
                'rejected_count' => $rejectedItems->count(),
                'approve_rate' => $decidedCount > 0 ? round($approvedItems->count() / $decidedCount * 100, 1) : null,
                'reject_rate' => $decidedCount > 0 ? round($rejectedItems->count() / $decidedCount * 100, 1) : null,
            ];
        })->values();

        return Inertia::render('Admin/Dashboards/Sa', [
            'saStats' => $stats,
            'summary' => [
                'total_orders' => $stats->sum('order_count'),
                'approved_order_count' => $stats->sum('approved_order_count'),
                'partially_approved_order_count' => $stats->sum('partially_approved_order_count'),
                // Menggantikan kartu "Overall Approve Rate" lama.
                'total_revenue_approved' => $stats->sum('revenue_approved'),
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