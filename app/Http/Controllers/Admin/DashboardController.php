<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class DashboardController extends Controller
{
    // Ambang waktu (hari) sebelum order dianggap "stuck" di status yang sama.
    // UPDATE: 3 -> 21 hari (permintaan owner, revisi PROJECT-RULES bagian 7).
    private const STUCK_THRESHOLD_DAYS = 21;

    // Needs Attention SEKARANG hanya mencakup 2 status ini (quality_control,
    // pending_approval, dan missing_invoice dilepas dari scope sesuai
    // permintaan). Key = status order, value = reason code yang dikirim
    // ke frontend untuk label badge:
    // - work_in_progress    -> lagi nunggu part datang
    // - invoice_preparation -> lagi nunggu customer ambil mobil
    private const STUCK_REASON_BY_STATUS = [
        ServiceOrder::STATUS_WORK_IN_PROGRESS => 'waiting_for_parts',
        ServiceOrder::STATUS_INVOICE_PREPARATION => 'waiting_for_pickup',
    ];

    public function __invoke(Request $request)
    {
        $user = $request->user();

        $baseQuery = ServiceOrder::query()
            ->when(
                $user->role === 'service_advisor',
                fn ($q) => $q->where('service_advisor_id', $user->id)
            );

        $statusCounts = (clone $baseQuery)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $stuckThreshold = Carbon::now()->subDays(self::STUCK_THRESHOLD_DAYS);

        // Order stuck di work_in_progress (nunggu part) atau invoice_preparation
        // (nunggu customer ambil mobil) terlalu lama. Pakai `status_changed_at`,
        // kolom yang di-set otomatis lewat model event `ServiceOrder::saving()`
        // HANYA saat kolom `status` benar-benar berubah — jadi order yang cuma
        // di-edit non-status tidak keanggap "baru".
        //
        // NOTE: quality_control, items_approval_status pending, dan invoice
        // belum diupload SUDAH TIDAK masuk Needs Attention (dilepas dari scope
        // sesuai permintaan) — sekarang murni "stuck di 2 status ini > 21 hari".
        $actionItems = (clone $baseQuery)
            ->whereIn('status', array_keys(self::STUCK_REASON_BY_STATUS))
            ->where('status_changed_at', '<', $stuckThreshold)
            ->with(['vehicle', 'serviceAdvisor'])
            ->get()
            ->map(fn ($order) => $this->toActionItem($order, self::STUCK_REASON_BY_STATUS[$order->status]))
            ->sortBy('sort_key')
            ->values()
            ->take(10);

        return Inertia::render('Admin/Dashboard', [
            'statusCounts' => [
                'appointment' => $statusCounts->get(ServiceOrder::STATUS_APPOINTMENT, 0),
                'work_in_progress' => $statusCounts->get(ServiceOrder::STATUS_WORK_IN_PROGRESS, 0),
                'quality_control' => $statusCounts->get(ServiceOrder::STATUS_QUALITY_CONTROL, 0),
                'invoice_preparation' => $statusCounts->get(ServiceOrder::STATUS_INVOICE_PREPARATION, 0),
                'completed' => $statusCounts->get(ServiceOrder::STATUS_COMPLETED, 0),
                'all_rejected_cancelled' => $statusCounts->get(ServiceOrder::STATUS_ALL_REJECTED_CANCELLED, 0),
            ],
            'actionItems' => $actionItems,
            'stuckThresholdDays' => self::STUCK_THRESHOLD_DAYS,
        ]);
    }

    private function toActionItem(ServiceOrder $order, string $reason): array
    {
        // Basisnya selalu status_changed_at karena "stuck" sekarang cuma soal
        // durasi order diam di status yang sama (work_in_progress /
        // invoice_preparation).
        $basis = $order->status_changed_at ?? $order->updated_at;

        return [
            'id' => $order->id,
            'work_order_number' => $order->work_order_number,
            'plate_number' => $order->vehicle?->plate_number,
            'service_advisor_name' => $order->serviceAdvisor?->name,
            'status' => $order->status,
            'reasons' => [$reason],
            'updated_at' => $basis->toIso8601String(),
            'days_ago' => (int) $basis->diffInDays(Carbon::now()),
            'sort_key' => $basis->toIso8601String(),
        ];
    }
}