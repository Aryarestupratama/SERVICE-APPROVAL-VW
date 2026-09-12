<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InspectionItem;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Inertia\Inertia;

class DashboardPartController extends Controller
{
    public function index(Request $request)
    {
        $items = InspectionItem::select(
            'name',
            'status',
            'cost_item',
            'cost_labour',
            'discount_item_percent',
            'discount_labour_percent',
            'final_price_snapshot'
        )->get();

        // Kontribusi rupiah 1 item — Part + Labour, masing-masing dikurangi
        // diskonnya sendiri. Sama definisinya dengan itemContribution() di
        // InspectionItemPricingService (PHP) / Show.jsx & InspectionReport.jsx
        // (JS) — lihat PROJECT-RULES bagian 1. Dipakai di sini untuk item
        // rejected (tidak pernah punya final_price_snapshot karena tidak
        // pernah di-lock).
        $contribution = function (InspectionItem $item) {
            $itemPrice = (float) $item->cost_item * (1 - ((float) ($item->discount_item_percent ?? 0)) / 100);
            $labourPrice = (float) $item->cost_labour * (1 - ((float) ($item->discount_labour_percent ?? 0)) / 100);

            return $itemPrice + $labourPrice;
        };

        $grouped = $items->groupBy('name')->map(function ($group, $name) use ($contribution) {
            $approved = $group->where('status', 'approved');
            $rejected = $group->where('status', 'rejected');
            $decidedCount = $approved->count() + $rejected->count();

            // Item approved sudah locked (final_price_snapshot terisi) —
            // pakai snapshot itu, bukan recompute dari cost_item/cost_labour,
            // supaya konsisten dengan Grand Total di Show.jsx/InspectionReport.jsx
            // (PROJECT-RULES bagian 1). Fallback ke $contribution() cuma
            // jaga-jaga kalau ada data approved lama yang snapshot-nya kosong.
            $revenueApproved = $approved->sum(
                fn (InspectionItem $item) => $item->final_price_snapshot !== null
                    ? (float) $item->final_price_snapshot
                    : $contribution($item)
            );

            $revenueRejected = $rejected->sum($contribution);

            return [
                'name' => $name,
                'used_count' => $group->count(),
                'revenue' => (float) $revenueApproved,
                'revenue_rejected' => (float) $revenueRejected,
                'approved_count' => $approved->count(),
                'rejected_count' => $rejected->count(),
                'reject_rate' => $decidedCount > 0
                    ? round($rejected->count() / $decidedCount * 100, 1)
                    : null,
            ];
        })->values()->sortByDesc('used_count')->values();

        $mostRejected = $grouped->sortByDesc('rejected_count')->first();

        $summary = [
            'total_revenue_approved' => $grouped->sum('revenue'),
            'total_revenue_rejected' => $grouped->sum('revenue_rejected'),
            'most_rejected_name' => ($mostRejected && $mostRejected['rejected_count'] > 0)
                ? $mostRejected['name']
                : '—',
        ];

        // $grouped adalah hasil agregasi in-memory (bukan Eloquent Builder),
        // jadi tidak bisa pakai ->paginate() langsung — pagination di-bikin
        // manual pakai LengthAwarePaginator, tapi hasil akhirnya tetap
        // compatible dengan DataTablePagination.jsx (bentuk data sama
        // seperti ->paginate() biasa). 'query' => $request->query() di sini
        // berfungsi setara ->withQueryString() (PROJECT-RULES 10.5 poin 5),
        // supaya link pagination tetap bawa filter period yang aktif.
        $perPage = 15;
        $page = (int) $request->input('page', 1);

        $paginated = new LengthAwarePaginator(
            $grouped->forPage($page, $perPage)->values(),
            $grouped->count(),
            $perPage,
            $page,
            [
                'path' => $request->url(),
                'query' => $request->query(),
            ]
        );

        return Inertia::render('Admin/Dashboards/Part', [
            'partStats' => $paginated,
            'summary' => $summary,
        ]);
    }
}