<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderFuas;
use App\Services\FuasStatusService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
