<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InspectionItem;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class DashboardPartController extends Controller
{
    private const SORTABLE = ['name', 'used_count', 'revenue', 'approved_count', 'rejected_count', 'reject_rate'];

    public function index(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);

        // PPN dipakai juga untuk item rejected. Revenue approved memakai final_price_snapshot
        // (SUDAH termasuk PPN), jadi rejected harus ikut termasuk PPN supaya keduanya sebanding.
        $vat = 1 + ((float) Setting::current()->ppn_percent) / 100;

        $items = InspectionItem::query()
            ->when($from || $to, fn ($q) => $q->whereHas('serviceOrder', fn ($sq) => $sq
                ->when($from, fn ($q2) => $q2->whereDate('created_at', '>=', $from))
                ->when($to, fn ($q2) => $q2->whereDate('created_at', '<=', $to))))
            ->get([
                'name',
                'status',
                'cost_item',
                'cost_labour',
                'discount_item_percent',
                'discount_labour_percent',
                'final_price_snapshot',
            ]);

        // Kontribusi rupiah 1 item termasuk PPN — sama dengan itemContribution() di
        // InspectionItemPricingService (total = subtotal setelah diskon x (1 + PPN)).
        $contribution = function (InspectionItem $item) use ($vat) {
            $itemPrice = (float) $item->cost_item * (1 - ((float) ($item->discount_item_percent ?? 0)) / 100);
            $labourPrice = (float) $item->cost_labour * (1 - ((float) ($item->discount_labour_percent ?? 0)) / 100);

            return ($itemPrice + $labourPrice) * $vat;
        };

        // Nama part adalah teks bebas: "Brake Pad", "brake pad ", "BRAKE PAD" dihitung SATU part.
        // Nama yang ditampilkan = ejaan yang paling sering dipakai.
        $grouped = $items->groupBy(fn ($item) => mb_strtolower(trim((string) $item->name)))
            ->map(function ($group) use ($contribution) {
                $approved = $group->where('status', 'approved');
                $rejected = $group->where('status', 'rejected');
                $decidedCount = $approved->count() + $rejected->count();

                $displayName = $group
                    ->groupBy(fn ($item) => trim((string) $item->name))
                    ->sortByDesc(fn ($g) => $g->count())
                    ->keys()
                    ->first();

                $revenueApproved = $approved->sum(
                    fn (InspectionItem $item) => $item->final_price_snapshot !== null
                        ? (float) $item->final_price_snapshot
                        : $contribution($item)
                );

                return [
                    'name' => $displayName,
                    'used_count' => $group->count(),
                    'revenue' => (float) $revenueApproved,
                    'revenue_rejected' => (float) $rejected->sum($contribution),
                    'approved_count' => $approved->count(),
                    'rejected_count' => $rejected->count(),
                    'decided_count' => $decidedCount,
                    'reject_rate' => $decidedCount > 0
                        ? round($rejected->count() / $decidedCount * 100, 1)
                        : null,
                ];
            })->values();

        $mostRejected = $grouped->sortByDesc('rejected_count')->first();

        $summary = [
            'total_revenue_approved' => $grouped->sum('revenue'),
            'total_revenue_rejected' => $grouped->sum('revenue_rejected'),
            'most_rejected_name' => ($mostRejected && $mostRejected['rejected_count'] > 0)
                ? $mostRejected['name']
                : '—',
        ];

        // Sort di SERVER (lintas semua baris, bukan cuma 15 baris di halaman aktif).
        $sortBy = $request->string('sort_by')->toString();
        if (in_array($sortBy, self::SORTABLE, true)) {
            $desc = $request->string('sort_dir')->toString() === 'desc';
            $grouped = $grouped->sortBy(
                fn ($row) => $sortBy === 'name' ? mb_strtolower((string) $row['name']) : ($row[$sortBy] ?? -1),
                SORT_REGULAR,
                $desc
            )->values();
        } else {
            $grouped = $grouped->sortByDesc('used_count')->values();
        }

        // Hasil agregasi in-memory: pagination manual, bentuk hasil sama dengan ->paginate().
        $perPage = 15;
        $page = max(1, (int) $request->input('page', 1));

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
            'filters' => [
                'period_mode' => $request->input('period_mode', 'preset'),
                'period_preset' => $request->input('period_preset', 'all'),
                'period_from' => $request->input('period_from'),
                'period_to' => $request->input('period_to'),
                'sort_by' => $sortBy ?: null,
                'sort_dir' => $request->input('sort_dir'),
            ],
        ]);
    }

    /** Basis filter: created_at ServiceOrder — sama dengan DashboardSaController. */
    private function resolveDateRange(Request $request): array
    {
        $parse = fn ($value) => $value ? rescue(fn () => Carbon::parse($value), null, false) : null;

        if ($request->input('period_mode', 'preset') === 'range') {
            return [$parse($request->input('period_from')), $parse($request->input('period_to'))];
        }

        $preset = $request->input('period_preset', 'all');

        $from = match ($preset) {
            '7d' => Carbon::now()->subDays(7),
            '30d' => Carbon::now()->subDays(30),
            '1y' => Carbon::now()->subYear(),
            default => null,
        };

        return [$from, $preset === 'all' ? null : Carbon::now()];
    }
}