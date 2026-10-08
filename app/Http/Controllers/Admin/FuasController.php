<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderFuas;
use App\Models\User;
use App\Services\FuasStatusService;
use DateTimeInterface;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * FUAS (Follow Up After Service): menyiapkan dan mengonfirmasi pengiriman form feedback.
 * Status selalu dihitung FuasStatusService (RULE-036); controller hanya menjaga akses
 * dan idempotensi (RULE-037, RULE-038).
 */
class FuasController extends Controller
{
    public function __construct(private readonly FuasStatusService $fuasStatus)
    {
    }

    /**
     * API-019. Daftar FUAS In Process / FUAS Completed (route memberi `scope`).
     * Search, filter, sort, dan pagination di server (RULE-022..025). Status tiap baris
     * dari FuasStatusService (RULE-036); klien tidak menghitung ulang. SA hanya melihat
     * order miliknya, admin semua dan dapat memfilter per SA (FR-032).
     */
    public function index(Request $request, string $scope): Response
    {
        $list = $scope === 'completed' ? FuasStatusService::LIST_COMPLETED : FuasStatusService::LIST_IN_PROCESS;
        $user = $request->user();
        $isAdmin = $user->role === 'admin';
        $now = now();

        $search = $this->stringParam($request, 'search');
        $statusParam = $this->stringParam($request, 'status');
        $status = in_array($statusParam, $this->fuasStatus->statusesForList($list), true) ? $statusParam : null;

        // SA dipaksa ke order miliknya; parameter service_advisor_id hanya berlaku untuk admin.
        $saId = $isAdmin ? (int) $this->stringParam($request, 'service_advisor_id') : (int) $user->id;

        $sortBy = $this->stringParam($request, 'sort_by');
        $sortBy = in_array($sortBy, ['work_order_number', 'status_changed_at', 'service_advisor', 'fuas_status'], true) ? $sortBy : null;
        $sortDir = $this->stringParam($request, 'sort_dir') === 'desc' ? 'desc' : 'asc';

        $query = ServiceOrder::query()
            ->select('service_orders.*')
            ->leftJoin('service_order_fuas as f', 'f.service_order_id', '=', 'service_orders.id')
            ->with(['vehicle.customer:id,name,phone', 'serviceAdvisor:id,name', 'fuas']);

        $this->fuasStatus->applyList($query, $list, $status ? [$status] : null, $now);

        $query
            ->when($saId > 0, fn ($q) => $q->where('service_orders.service_advisor_id', $saId))
            ->when($search !== '', fn ($q) =>
                // RULE-024: orWhere dibungkus supaya tidak lolos dari filter lain.
                $q->where(function ($w) use ($search) {
                    $w->where('service_orders.work_order_number', 'like', "%{$search}%")
                        ->orWhereHas('vehicle.customer', fn ($c) => $c->where('name', 'like', "%{$search}%"))
                        ->orWhereHas('vehicle', fn ($v) => $v->where('plate_number', 'like', "%{$search}%"));
                })
            );

        // Kolom sort dari daftar putih (RULE-022); urutan akhir selalu dipatok id agar stabil (RULE-066).
        if ($sortBy === 'work_order_number' || $sortBy === 'status_changed_at') {
            $query->orderBy("service_orders.{$sortBy}", $sortDir);
        } elseif ($sortBy === 'service_advisor') {
            $query->orderBy(
                User::query()->select('name')->whereColumn('users.id', 'service_orders.service_advisor_id')->limit(1),
                $sortDir
            );
        } elseif ($sortBy === 'fuas_status') {
            [$prioritySql, $priorityBindings] = $this->fuasStatus->sqlPriority($now);
            $query->orderByRaw("{$prioritySql} {$sortDir}", $priorityBindings);
        } elseif ($list === FuasStatusService::LIST_IN_PROCESS) {
            // Yang butuh aksi lebih dulu (Reminder Due, To Send), lalu order terlama.
            [$prioritySql, $priorityBindings] = $this->fuasStatus->sqlPriority($now);
            $query->orderByRaw("{$prioritySql} asc", $priorityBindings)
                ->orderBy('service_orders.status_changed_at', 'asc');
        } else {
            $query->orderBy('service_orders.status_changed_at', 'desc');
        }
        $query->orderBy('service_orders.id', 'asc');

        $orders = $query->paginate(20)->withQueryString()
            ->through(fn (ServiceOrder $order) => $this->presentRow($order, $now));

        $filters = array_filter([
            'status' => $status,
            'service_advisor_id' => $isAdmin && $saId > 0 ? (string) $saId : null,
            'sort_by' => $sortBy,
            'sort_dir' => $sortBy ? $sortDir : null,
        ], fn ($v) => $v !== null);

        return Inertia::render('Admin/Fuas/Index', [
            'orders' => $orders,
            'scope' => $list,
            'search' => $search,
            'filters' => $filters,
            'statusOptions' => $this->fuasStatus->statusesForList($list),
            'serviceAdvisors' => $isAdmin
                ? User::where('role', 'service_advisor')->orderBy('name')->get(['id', 'name'])
                : [],
        ]);
    }

    /**
     * API-024. Jumlah order yang butuh aksi untuk badge menu; dipoll ringan (RULE-044).
     * Lingkup per role dihitung di FuasStatusService (FR-032).
     */
    public function actionCount(Request $request): JsonResponse
    {
        return response()->json([
            'count' => $this->fuasStatus->actionCountFor($request->user()),
        ]);
    }

    /**
     * API-020. Idempotent: membuat baris FUAS + feedback_token bila belum ada dan
     * mengembalikan URL feedback. Hanya saat tombol kirim aktif (To Send / Reminder Due).
     * Mengembalikan JSON (dipanggil lewat fetch dari modal FUAS, TASK-030), bukan redirect.
     */
    public function prepare(Request $request, ServiceOrder $serviceOrder): JsonResponse
    {
        $this->authorizeFuas($request, $serviceOrder);

        $status = $this->fuasStatus->forOrder($serviceOrder);

        if (! $this->fuasStatus->canSend($status)) {
            return response()->json([
                'message' => 'This order is not ready to send a feedback message.',
            ], 409);
        }

        $fuas = $serviceOrder->fuas ?? $this->firstOrCreateRow($serviceOrder);

        // Path sama dengan API-022 (GET /feedback/{token}, TASK-032).
        return response()->json([
            'url' => url('/feedback/' . $fuas->feedback_token),
            'status' => $status,
        ]);
    }

    /**
     * API-021. Menambah sent_count hanya pada To Send / Reminder Due, dalam transaksi dengan
     * lock; klik ganda tidak menghitung dua kali (RULE-037). Penolakan lewat
     * back()->with('error') (RULE-040).
     */
    public function confirmSent(Request $request, ServiceOrder $serviceOrder): RedirectResponse
    {
        $this->authorizeFuas($request, $serviceOrder);

        $user = $request->user();
        $error = null;
        $newCount = null;

        DB::transaction(function () use ($serviceOrder, $user, &$error, &$newCount) {
            // Urutan lock selalu order dulu, lalu baris FUAS.
            $order = ServiceOrder::whereKey($serviceOrder->id)->lockForUpdate()->firstOrFail();
            $fuas = ServiceOrderFuas::where('service_order_id', $order->id)->lockForUpdate()->first();

            if ($fuas === null) {
                $error = 'Prepare the feedback link first before confirming the message was sent.';
                return;
            }

            $now = now();
            $status = $this->fuasStatus->forOrder($order, $fuas, $now);

            if (! $this->fuasStatus->canSend($status)) {
                $error = 'This message was already recorded or is not due yet.';
                return;
            }

            $fuas->forceFill([
                'sent_count' => $fuas->sent_count + 1,
                'first_sent_at' => $fuas->first_sent_at ?? $now,
                'last_sent_at' => $now,
                'last_sent_by' => $user->id,
            ])->save();

            $newCount = $fuas->sent_count;
        });

        if ($error !== null) {
            return back()->with('error', $error);
        }

        return back()->with('success', "Message recorded as sent ({$newCount} of " . FuasStatusService::MAX_SENT . ').');
    }

    /**
     * Bentuk baris untuk klien. Hanya field yang dibutuhkan (tanpa feedback_token; token baru
     * diberikan lewat prepare saat tombol kirim ditekan). Status dari FuasStatusService.
     *
     * @return array<string, mixed>
     */
    private function presentRow(ServiceOrder $order, DateTimeInterface $now): array
    {
        $fuas = $order->fuas;
        $status = $this->fuasStatus->forOrder($order, $fuas, $now);
        $lastSentAt = $fuas?->last_sent_at;

        return [
            'id' => $order->id,
            'work_order_number' => $order->work_order_number,
            'status_changed_at' => $order->status_changed_at?->toIso8601String(),
            'vehicle' => $order->vehicle ? [
                'brand' => $order->vehicle->brand,
                'model' => $order->vehicle->model,
                'plate_number' => $order->vehicle->plate_number,
                'customer' => $order->vehicle->customer ? [
                    'name' => $order->vehicle->customer->name,
                    'phone' => $order->vehicle->customer->phone,
                ] : null,
            ] : null,
            'service_advisor' => $order->serviceAdvisor ? ['name' => $order->serviceAdvisor->name] : null,
            'fuas' => [
                'status' => $status,
                'sent_count' => (int) ($fuas?->sent_count ?? 0),
                'can_send' => $this->fuasStatus->canSend($status),
                'last_sent_at' => $lastSentAt?->toIso8601String(),
                // Kapan jendela 1 hari berakhir (reminder tersedia / link tertutup).
                'window_end_at' => $lastSentAt ? $this->fuasStatus->windowEnd($lastSentAt)->format(DATE_ATOM) : null,
            ],
        ];
    }

    private function stringParam(Request $request, string $key): string
    {
        $value = $request->query($key);

        return is_string($value) ? trim($value) : '';
    }

    /**
     * Pengecualian khusus FUAS (FR-032): admin semua order; SA hanya order miliknya.
     * authorizeAccess() di ServiceOrderController sengaja tidak dipakai (meloloskan semua SA).
     */
    private function authorizeFuas(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            return;
        }

        if ($user->role === 'service_advisor' && (int) $serviceOrder->service_advisor_id === (int) $user->id) {
            return;
        }

        abort(403, 'You do not have access to this service order.');
    }

    private function firstOrCreateRow(ServiceOrder $order): ServiceOrderFuas
    {
        try {
            return ServiceOrderFuas::firstOrCreate(
                ['service_order_id' => $order->id],
                ['feedback_token' => $this->newToken(), 'sent_count' => 0],
            );
        } catch (UniqueConstraintViolationException) {
            // Dua request menyiapkan bersamaan: pakai baris yang menang.
            return ServiceOrderFuas::where('service_order_id', $order->id)->firstOrFail();
        }
    }

    /** feedback_token MUST berbeda dari inspection_token (RULE-038, ADR-013). */
    private function newToken(): string
    {
        do {
            $token = Str::random(32);
        } while (
            ServiceOrder::where('inspection_token', $token)->exists()
            || ServiceOrderFuas::where('feedback_token', $token)->exists()
        );

        return $token;
    }
}
