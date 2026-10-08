<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrderFuas;
use App\Models\Setting;
use App\Services\FuasStatusService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Halaman publik feedback FUAS (SCR-018). Akses lewat feedback_token yang terpisah dari
 * inspection_token (RULE-038, ADR-013). Status link dicek di server pada GET dan POST.
 * Teks yang tampil ke customer berbahasa Indonesia (pengecualian RULE-010).
 */
class FeedbackController extends Controller
{
    public const STATE_FORM = 'form';
    public const STATE_SUBMITTED = 'submitted';
    public const STATE_CLOSED = 'closed';

    public function __construct(private readonly FuasStatusService $fuasStatus)
    {
    }

    /**
     * API-022. Tiga state: form, submitted (terima kasih, read-only), closed.
     * State selain form tidak membawa data pribadi apa pun.
     */
    public function show(string $token): Response
    {
        $fuas = ServiceOrderFuas::where('feedback_token', $token)->firstOrFail();
        $state = $this->stateFor($fuas);

        $props = [
            'state' => $state,
            'settings' => ['workshop_name' => Setting::current()->workshop_name],
        ];

        if ($state === self::STATE_FORM) {
            $fuas->load('serviceOrder.vehicle.customer');
            $vehicle = $fuas->serviceOrder?->vehicle;

            $props += [
                'token' => $token,
                'customer' => ['name' => $vehicle?->customer?->name],
                'vehicle' => $vehicle ? [
                    'brand' => $vehicle->brand,
                    'model' => $vehicle->model,
                    'plate_number' => $vehicle->plate_number,
                ] : null,
                'categories' => collect(ServiceOrderFuas::CATEGORIES)
                    ->map(fn (string $label, string $value) => ['value' => $value, 'label' => $label])
                    ->values(),
            ];
        }

        return Inertia::render('Public/Feedback', $props);
    }

    /**
     * API-023. Menyimpan jawaban sekali saja. Link tertutup = 410, sudah terisi = 409
     * (keduanya ditangani router.on('invalid') di halaman, RULE-041). Pemeriksaan diulang
     * di dalam transaksi dengan lock supaya dua pengiriman bersamaan tidak menimpa.
     */
    public function submit(Request $request, string $token): RedirectResponse
    {
        $fuas = ServiceOrderFuas::where('feedback_token', $token)->firstOrFail();
        $this->guardOpen($fuas);

        $data = $request->validate([
            'satisfaction_score' => ['required', 'integer', 'between:1,10'],
            'recommend_score' => ['required', 'integer', 'between:1,10'],
            'vehicle_issue_note' => ['required', 'string', 'max:2000'],
            'suggestion' => ['nullable', 'string', 'max:2000'],
            'suggestion_categories' => ['nullable', 'array', 'max:5'],
            'suggestion_categories.*' => ['string', 'distinct', Rule::in(array_keys(ServiceOrderFuas::CATEGORIES))],
        ], $this->messages());

        DB::transaction(function () use ($fuas, $data) {
            $locked = ServiceOrderFuas::whereKey($fuas->id)->lockForUpdate()->firstOrFail();
            $this->guardOpen($locked);

            $categories = array_values(array_unique($data['suggestion_categories'] ?? []));

            $locked->forceFill([
                'satisfaction_score' => (int) $data['satisfaction_score'],
                'recommend_score' => (int) $data['recommend_score'],
                'vehicle_issue_note' => $data['vehicle_issue_note'],
                'suggestion' => $data['suggestion'] ?? null,
                'suggestion_categories' => $categories === [] ? null : $categories,
                'submitted_at' => now(),
            ])->save();
        });

        return redirect()->route('public.feedback.show', $token);
    }

    private function stateFor(ServiceOrderFuas $fuas): string
    {
        if ($fuas->submitted_at !== null) {
            return self::STATE_SUBMITTED;
        }

        return $this->fuasStatus->isFeedbackLinkActive(
            (int) $fuas->sent_count,
            $fuas->last_sent_at,
            $fuas->submitted_at,
            now(),
        ) ? self::STATE_FORM : self::STATE_CLOSED;
    }

    private function guardOpen(ServiceOrderFuas $fuas): void
    {
        $state = $this->stateFor($fuas);

        if ($state === self::STATE_SUBMITTED) {
            abort(409, 'Feedback ini sudah terkirim sebelumnya.');
        }
        if ($state === self::STATE_CLOSED) {
            abort(410, 'Link feedback ini sudah ditutup.');
        }
    }

    /** @return array<string, string> */
    private function messages(): array
    {
        $score = 'Pilih angka 1 sampai 10.';

        return [
            'satisfaction_score.required' => $score,
            'satisfaction_score.integer' => $score,
            'satisfaction_score.between' => $score,
            'recommend_score.required' => $score,
            'recommend_score.integer' => $score,
            'recommend_score.between' => $score,
            'vehicle_issue_note.required' => 'Wajib diisi. Tulis "Tidak ada" jika tidak ada kendala.',
            'vehicle_issue_note.max' => 'Maksimal 2000 karakter.',
            'suggestion.max' => 'Maksimal 2000 karakter.',
            'suggestion_categories.max' => 'Pilihan kategori tidak valid.',
            'suggestion_categories.*.in' => 'Pilihan kategori tidak valid.',
            'suggestion_categories.*.distinct' => 'Pilihan kategori tidak valid.',
        ];
    }
}
