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
    // FINAL 3 hari, dikonfirmasi owner (PROJECT-RULES bagian 7).
    private const STUCK_THRESHOLD_DAYS = 3;

    // Ambang waktu (hari) sebelum item pending dianggap "customer belum respon lama".
    private const PENDING_APPROVAL_THRESHOLD_DAYS = 3;

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
        $pendingThreshold = Carbon::now()->subDays(self::PENDING_APPROVAL_THRESHOLD_DAYS);

        // 1. Order stuck di work_in_progress atau quality_control terlalu lama.
        // FIX: sebelumnya pakai `updated_at` (proxy lama, ditandai TODO di
        // PROJECT-RULES bagian 7) — sekarang pakai `status_changed_at`, kolom
        // yang sudah diimplementasikan di migration & di-set otomatis lewat
        // model event `ServiceOrder::saving()` HANYA saat kolom `status`
        // benar-benar berubah. Ini menutup gap "order keanggap baru padahal
        // cuma di-edit non-status" yang jadi alasan kolom ini dibuat.
        $stuckOrders = (clone $baseQuery)
            ->whereIn('status', [
                ServiceOrder::STATUS_WORK_IN_PROGRESS,
                ServiceOrder::STATUS_QUALITY_CONTROL,
            ])
            ->where('status_changed_at', '<', $stuckThreshold)
            ->with(['vehicle', 'serviceAdvisor'])
            ->get()
            ->map(fn ($order) => $this->toActionItem($order, 'stuck_status'));

        // 2. Item approval masih pending, sudah lama, customer belum respon.
        // TETAP pakai `updated_at` (sengaja, BUKAN gap yang sama dengan poin 1)
        // — kondisi ini berbasis `items_approval_status`, bukan `status` order,
        // jadi `status_changed_at` (yang cuma mengikuti kolom `status`) tidak
        // relevan di sini. Catatan: `updated_at` order tetap bisa "ter-refresh"
        // oleh edit lain yang tidak terkait approval (misal ubah
        // inspection_fee_note) selama item masih pending — kalau presisi di
        // titik ini jadi penting, perlu kolom timestamp terpisah yang
        // di-set khusus saat `items_approval_status` berubah ke pending
        // (pola sama seperti `status_changed_at`, scope terpisah, belum
        // dikerjakan sesi ini).
        $pendingApprovalOrders = (clone $baseQuery)
            ->where('items_approval_status', ServiceOrder::ITEMS_APPROVAL_PENDING)
            ->where('updated_at', '<', $pendingThreshold)
            ->with(['vehicle', 'serviceAdvisor'])
            ->get()
            ->map(fn ($order) => $this->toActionItem($order, 'pending_approval'));

        // 3. Sudah di invoice_preparation tapi invoice belum diupload
        $missingInvoiceOrders = (clone $baseQuery)
            ->where('status', ServiceOrder::STATUS_INVOICE_PREPARATION)
            ->whereDoesntHave('invoice')
            ->with(['vehicle', 'serviceAdvisor'])
            ->get()
            ->map(fn ($order) => $this->toActionItem($order, 'missing_invoice'));

        // Gabungkan per order id — 1 order bisa kena lebih dari 1 kondisi sekaligus,
        // jadi ditampilkan sebagai 1 baris multi-badge, bukan baris duplikat
        // (PROJECT-RULES bagian 7). Sorting & limit dilakukan SETELAH gabung supaya
        // order yang muncul di >1 kategori tidak "kepotong" duluan.
        //
        // Sorting tetap pakai `sort_key` yang di-set per item di toActionItem()
        // (lihat catatan di bawah) — untuk 'stuck_status' itu berarti
        // `status_changed_at`, untuk reason lain tetap `updated_at`. Kalau 1
        // order kena >1 reason dengan sort_key berbeda, dipakai yang PALING
        // LAMA (paling butuh perhatian) dari sort_key-sort_key itu.
        $actionItems = $stuckOrders
            ->concat($pendingApprovalOrders)
            ->concat($missingInvoiceOrders)
            ->groupBy('id')
            ->map(function ($items) {
                $first = $items->first();
                $first['reasons'] = $items->pluck('reason')->unique()->values()->all();
                $first['sort_key'] = $items->min('sort_key');
                unset($first['reason']);
                return $first;
            })
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
        // Basis waktu "lama"-nya beda tergantung reason: stuck_status pakai
        // status_changed_at (lihat catatan di poin 1 query di atas), reason
        // lain tetap updated_at. sort_key & days_ago dihitung dari basis yang
        // sesuai, supaya angka "X hari" yang ditampilkan ke user benar-benar
        // menceritakan hal yang relevan dengan reason itu (bukan disamakan
        // semua ke updated_at seperti sebelumnya).
        $basis = $reason === 'stuck_status'
            ? ($order->status_changed_at ?? $order->updated_at)
            : $order->updated_at;

        return [
            'id' => $order->id,
            'work_order_number' => $order->work_order_number,
            'plate_number' => $order->vehicle?->plate_number,
            'service_advisor_name' => $order->serviceAdvisor?->name,
            'status' => $order->status,
            'reason' => $reason,
            'updated_at' => $basis->toIso8601String(),
            'days_ago' => (int) $basis->diffInDays(Carbon::now()),
            'sort_key' => $basis->toIso8601String(),
        ];
    }
}