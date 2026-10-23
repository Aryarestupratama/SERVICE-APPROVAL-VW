<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\InspectionItem;
use App\Models\ServiceOrder;
use App\Models\Setting;
use App\Services\InspectionItemPricingService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;

class DashboardController extends Controller
{
    // Ambang waktu (hari) sebelum order dianggap "stuck" di status yang sama.
    // UPDATE: 3 -> 21 hari (permintaan owner, revisi PROJECT-RULES bagian 7).
    private const STUCK_THRESHOLD_DAYS = 21;

    // Aturan "macet per waktu" di Needs Attention HANYA untuk status ini. Key = status
    // order, value = reason code yang dikirim ke frontend untuk label badge:
    // - invoice_preparation -> lagi nunggu customer ambil mobil
    // TASK-055: work_in_progress DIHAPUS dari aturan ini (keputusan owner 2026-10-23):
    // "nunggu part / approval" sekarang ditandai eksplisit oleh SA lewat delay reason
    // (TASK-053), yang masuk Needs Attention lewat jalur terpisah (delay_reason).
    private const STUCK_REASON_BY_STATUS = [
        ServiceOrder::STATUS_INVOICE_PREPARATION => 'waiting_for_pickup',
    ];

    // Order dianggap "sedang berjalan" (masih di bengkel) kalau statusnya
    // salah satu dari ini — appointment (belum datang), completed & cancelled
    // (sudah selesai) sengaja dikecualikan. Urutan array ini juga dipakai
    // sebagai urutan tampil default di section "In Progress".
    private const IN_PROGRESS_STATUSES = [
        ServiceOrder::STATUS_WORK_IN_PROGRESS,
        ServiceOrder::STATUS_QUALITY_CONTROL,
        ServiceOrder::STATUS_INVOICE_PREPARATION,
    ];

    // Kedua chart (Cars In & Revenue) mendukung toggle rentang ini di
    // frontend. Data KEDUA rentang dikirim sekaligus supaya switch di
    // Dashboard.jsx instan (tidak perlu round-trip ke server tiap ganti).
    private const CHART_RANGES = [7, 30];

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

        // Order stuck di invoice_preparation (nunggu customer ambil mobil) terlalu lama.
        // Pakai `status_changed_at`,
        // kolom yang di-set otomatis lewat model event `ServiceOrder::saving()`
        // HANYA saat kolom `status` benar-benar berubah — jadi order yang cuma
        // di-edit non-status tidak keanggap "baru".
        //
        // NOTE: quality_control, items_approval_status pending, dan invoice
        // belum diupload SUDAH TIDAK masuk Needs Attention (dilepas dari scope
        // sesuai permintaan) — stuck per waktu sekarang hanya untuk invoice_preparation
        // > 21 hari; work_in_progress diganti sistem delay reason (TASK-055).
        //
        // TASK-054: order dengan delay reason aktif (Waiting Part / Waiting Approval, hanya
        // mungkin di WIP/QC) juga masuk, berapa pun umurnya, dan sebaliknya dikeluarkan
        // dari In Progress (lihat inProgressOrdersFor). Kondisi dikelompokkan dalam closure
        // supaya filter SA di $baseQuery tetap berlaku untuk kedua cabang.
        $actionItems = (clone $baseQuery)
            ->where(function ($q) use ($stuckThreshold) {
                $q->where(function ($stuck) use ($stuckThreshold) {
                    $stuck->whereIn('status', array_keys(self::STUCK_REASON_BY_STATUS))
                        ->where('status_changed_at', '<', $stuckThreshold);
                })->orWhereNotNull('delay_reason');
            })
            ->with(['vehicle', 'serviceAdvisor'])
            ->get()
            ->map(fn ($order) => $this->toActionItem($order))
            ->sortBy('sort_key')
            ->values();

        // Total SEBELUM dipotong 10, supaya judul "Needs Attention (N)" tidak
        // ikut terpotong di angka 10.
        $actionItemsTotal = $actionItems->count();
        $actionItems = $actionItems->take(10)->values();

        $inProgressOrders = $this->inProgressOrdersFor($baseQuery);

        // {7: [...30 titik hari...], 30: [...]} — key-nya string di JSON
        // (Object di JS), frontend tinggal index pakai range aktif.
        $carsInByRange = [];
        $revenueByRange = [];
        // Closure (lazy): tidak dihitung saat partial reload yang tidak memintanya
        // (polling Dashboard hanya meminta statusCounts + actionItems).
        $carsInByRange = fn () => collect(self::CHART_RANGES)
            ->mapWithKeys(fn ($days) => [$days => $this->carsInSeries($baseQuery, $days)])
            ->all();
        $revenueByRange = fn () => collect(self::CHART_RANGES)
            ->mapWithKeys(fn ($days) => [$days => $this->revenueSeries($baseQuery, $days)])
            ->all();

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
            'actionItemsTotal' => $actionItemsTotal,
            'stuckThresholdDays' => self::STUCK_THRESHOLD_DAYS,
            'inProgressOrders' => $inProgressOrders,
            'carsInByRange' => $carsInByRange,
            'revenueByRange' => $revenueByRange,
        ]);
    }

    /**
     * Endpoint ringan untuk polling (pola sama seperti PROJECT-RULES §12 —
     * dipakai di Admin/ServiceOrders/Show.jsx & Public/InspectionReport.jsx):
     * HANYA balikin sinyal perubahan (jumlah order + timestamp terbaru, SEMUA status
     * supaya tile status & Needs Attention ikut segar saat order baru masuk),
     * bukan data lengkap. Frontend poll ke sini tiap beberapa detik; kalau
     * signature berubah, baru fetch data lengkap lewat inProgressFeed().
     */
    public function inProgressActivity(Request $request)
    {
        $user = $request->user();

        $baseQuery = ServiceOrder::query()
            ->when(
                $user->role === 'service_advisor',
                fn ($q) => $q->where('service_advisor_id', $user->id)
            );

        $count = (clone $baseQuery)->count();
        $latest = (clone $baseQuery)->max('status_changed_at');

        // TASK-053: delay reason berubah tanpa mengubah status, jadi tidak tertangkap oleh
        // status_changed_at. Hash kecil dari pasangan id:delay_reason (hanya order yang
        // sedang delay) cukup untuk mendeteksinya tanpa query berat.
        $delays = (clone $baseQuery)
            ->whereNotNull('delay_reason')
            ->orderBy('id')
            ->pluck('delay_reason', 'id');
        $delayHash = crc32($delays->toJson());

        return response()->json([
            // count + latest timestamp cukup untuk mendeteksi: order baru
            // masuk (count berubah), order pindah status (latest berubah),
            // atau order keluar dari In Progress (count berubah). Hash delay
            // menambah deteksi perubahan alasan keterlambatan.
            'signature' => "{$count}:{$latest}:{$delayHash}",
        ]);
    }

    /**
     * Data lengkap In Progress, dipanggil frontend HANYA saat
     * inProgressActivity() menunjukkan ada perubahan (signature beda dari
     * yang terakhir diketahui) — bukan dipoll langsung tiap interval, supaya
     * query yang lebih berat ini (with relasi) tidak dibebani tiap detik.
     */
    public function inProgressFeed(Request $request)
    {
        $user = $request->user();

        $baseQuery = ServiceOrder::query()
            ->when(
                $user->role === 'service_advisor',
                fn ($q) => $q->where('service_advisor_id', $user->id)
            );

        return response()->json([
            'inProgressOrders' => $this->inProgressOrdersFor($baseQuery),
        ]);
    }

    private function inProgressOrdersFor($baseQuery)
    {
        return (clone $baseQuery)
            ->whereIn('status', self::IN_PROGRESS_STATUSES)
            // TASK-054: order yang delay pindah ke Needs Attention; In Progress murni tanpa delay.
            ->whereNull('delay_reason')
            ->with(['vehicle', 'serviceAdvisor', 'customer'])
            ->get()
            ->map(fn ($order) => $this->toInProgressItem($order))
            // Paling lama diam di status sekarang tampil duluan — sejalan
            // dengan urgensi yang sama dipakai di Needs Attention.
            ->sortBy('sort_key')
            ->values();
    }

    private function toActionItem(ServiceOrder $order): array
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
            // TASK-054: bila delay aktif, badge delay yang tampil dan alasan default (macet
            // per status) dilewati supaya tidak ada dua badge bermakna sama; lamanya tetap
            // terbaca dari days_ago. Tanpa delay, alasan default mengikuti status.
            'delay_reason' => $order->delay_reason,
            'reasons' => $order->delay_reason === null
                ? [self::STUCK_REASON_BY_STATUS[$order->status]]
                : [],
            'updated_at' => $basis->toIso8601String(),
            'days_ago' => (int) $basis->diffInDays(Carbon::now()),
            'sort_key' => $basis->toIso8601String(),
        ];
    }

    private function toInProgressItem(ServiceOrder $order): array
    {
        $basis = $order->status_changed_at ?? $order->updated_at;

        return [
            'id' => $order->id,
            'work_order_number' => $order->work_order_number,
            'plate_number' => $order->vehicle?->plate_number,
            'customer_name' => $order->customer?->name,
            'service_advisor_name' => $order->serviceAdvisor?->name,
            'status' => $order->status,
            'days_ago' => (int) $basis->diffInDays(Carbon::now()),
            'sort_key' => $basis->toIso8601String(),
        ];
    }

    /**
     * Jumlah mobil masuk per hari, $days hari terakhir (termasuk hari ini).
     * "Masuk" = order dibuat (created_at), independen dari status saat ini.
     */
    private function carsInSeries($baseQuery, int $days): array
    {
        $since = Carbon::now()->startOfDay()->subDays($days - 1);

        $counts = (clone $baseQuery)
            ->where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) as day, count(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        return $this->fillLastNDays($since, $days, 'count', fn (Carbon $day) => (int) ($counts[$day->toDateString()] ?? 0));
    }

    /**
     * Pendapatan per hari, $days hari terakhir. Dihitung dari order yang
     * STATUSNYA BERUBAH JADI `completed` di hari tsb (status_changed_at),
     * dijumlah dari final_price_snapshot item-item yang approved PLUS
     * inspection_fee order tsb (TASK-009 / OQ-6, keputusan owner: grafik ini
     * = tagihan, yaitu Confirmed Total + fee). Fee 0 berarti gratis atau
     * sudah termasuk di harga item, jadi tidak terhitung ganda. Item snapshot
     * sudah ber-PPN, fee juga ditambah PPN-nya (TASK-054, sama dengan Amount due). Basisnya
     * sengaja snapshot yang sudah dikunci (bukan recompute cost_item/
     * cost_labour), konsisten dengan keputusan breakdown Grand Total di
     * InspectionItemPricingService (lihat PROJECT-RULES bagian 1).
     *
     * CATATAN DEFINISI (dikonfirmasi): basisnya ServiceOrder, bukan
     * ServiceOrderInvoice/ServiceOrderPaymentReceipt — kedua model itu cuma
     * menyimpan file_path bukti dokumen, tidak ada nominal di dalamnya.
     */
    private function revenueSeries($baseQuery, int $days): array
    {
        $since = Carbon::now()->startOfDay()->subDays($days - 1);

        $orderIds = (clone $baseQuery)
            ->where('status', ServiceOrder::STATUS_COMPLETED)
            ->where('status_changed_at', '>=', $since)
            ->pluck('id', 'id');

        if ($orderIds->isEmpty()) {
            return $this->fillLastNDays($since, $days, 'amount', fn () => 0);
        }

        // Peta order_id -> tanggal completed, dipakai untuk mengelompokkan
        // total item ke hari yang benar (bukan hari item dibuat). pluck()
        // bisa delegate ke query builder mentah (bypass cast 'datetime' di
        // model), jadi nilainya bisa balik sebagai string ATAU Carbon —
        // ditangani dua-duanya di sini.
        $completedDayByOrderId = (clone $baseQuery)
            ->whereIn('id', $orderIds)
            ->pluck('status_changed_at', 'id')
            ->map(fn ($ts) => ($ts instanceof Carbon ? $ts : Carbon::parse($ts))->toDateString());

        // InspectionItem tidak mendefinisikan konstanta status (lihat komentar
        // fillable-nya: 'pending, approved, rejected') — pakai string literal,
        // sama seperti konvensi yang sudah dipakai di
        // ServiceOrder::computeApprovalStatus()/hasPendingItems().
        $totalsByOrderId = InspectionItem::query()
            ->whereIn('service_order_id', $orderIds)
            ->where('status', 'approved')
            ->selectRaw('service_order_id, sum(final_price_snapshot) as total')
            ->groupBy('service_order_id')
            ->pluck('total', 'service_order_id');

        // Fee per order. Order tanpa item approved (mis. semua ditolak) tetap
        // membawa fee, jadi penjumlahan berjalan per order completed, bukan
        // per order yang punya item approved.
        // TASK-054: fee yang tidak termasuk di harga item tetap kena PPN, jadi yang dijumlah
        // adalah fee + PPN fee (tarif PPN Settings saat ini).
        $pricing = new InspectionItemPricingService();
        $currentPpn = (float) Setting::current()->ppn_percent;
        $feeByOrderId = (clone $baseQuery)
            ->whereIn('id', $orderIds)
            ->get(['id', 'inspection_fee'])
            ->mapWithKeys(fn (ServiceOrder $o) => [
                $o->id => $pricing->inspectionFeeBreakdown($o, $currentPpn)['total'],
            ]);

        $totalsByDay = [];
        foreach ($completedDayByOrderId as $orderId => $day) {
            $amount = (int) ($totalsByOrderId[$orderId] ?? 0)
                + (int) ($feeByOrderId[$orderId] ?? 0);
            $totalsByDay[$day] = ($totalsByDay[$day] ?? 0) + $amount;
        }

        return $this->fillLastNDays($since, $days, 'amount', fn (Carbon $day) => $totalsByDay[$day->toDateString()] ?? 0);
    }

    /**
     * Bikin array $days hari berurutan (termasuk hari tanpa data, diisi
     * lewat $resolver) supaya chart di frontend selalu dapat titik penuh,
     * bukan cuma hari-hari yang kebetulan ada datanya. $field menentukan key
     * ('count' atau 'amount') yang diisi nilainya — key lainnya diset null
     * supaya shape objeknya tetap konsisten di kedua chart.
     *
     * 'label' dibuat beda format tergantung rentang: nama hari ('Mon') untuk
     * 7 hari supaya gampang dibaca, tanggal singkat ('12 Sep') untuk 30 hari
     * karena nama hari akan berulang dan jadi ambigu.
     */
    private function fillLastNDays(Carbon $since, int $days, string $field, callable $resolver): array
    {
        $labelFormat = $days <= 7 ? 'D' : 'd M';

        $result = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $since->copy()->addDays($i);
            $result[] = [
                'date' => $day->toDateString(),
                'label' => $day->locale('en')->translatedFormat($labelFormat),
                'count' => $field === 'count' ? $resolver($day) : null,
                'amount' => $field === 'amount' ? $resolver($day) : null,
            ];
        }

        return $result;
    }
}