<?php

namespace Database\Seeders;

use App\Models\ServiceOrder;
use App\Models\ServiceOrderFuas;
use App\Services\FuasStatusService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Data DEMO FUAS (Follow Up After Service) untuk order yang SUDAH completed (semua data FIKTIF).
 *
 * Seeder ini TIDAK membuat service order. Ia membaca order berstatus `completed` yang sudah
 * ada (hasil DemoDataSeeder), lalu membuat baris `service_order_fuas` dengan riwayat kirim dan
 * feedback yang konsisten dengan aturan FuasStatusService (Schema.md 5A), supaya keenam status
 * tampil di menu FUAS: To Send, Sent (1), Reminder Due, Sent (2), No Feedback, Feedback Received.
 *
 * Aturan yang dijaga (RULE-036, RULE-037, RULE-038):
 *  - Hanya order completed yang sudah melewati 4 x 24 jam sejak `status_changed_at`.
 *  - `sent_count` 0..2; jeda antar kirim minimal 24 jam; `feedback_token` unik dan berbeda dari
 *    `inspection_token`.
 *  - Status TIDAK disimpan; hanya timestamp dan hitungan. Status tampil tetap dari FuasStatusService.
 *  - To Send = order eligible TANPA baris FUAS (baris dibuat lazily oleh FuasController::prepare).
 *  - `service_orders` tidak disentuh sama sekali (RULE-035).
 *
 * Cara pakai (JANGAN di database produksi):
 *   php artisan migrate:fresh --seed                 # kalau DemoDataSeeder ikut dipanggil DatabaseSeeder
 *   php artisan db:seed --class=FuasDemoSeeder       # atau dijalankan sendiri
 *
 * Aman dijalankan ulang: order yang sudah punya baris FUAS dilewati.
 *
 * Catatan: status bergantung pada waktu sekarang. Data yang di-seed hari ini akan bergeser
 * (mis. Sent (1) menjadi Reminder Due setelah 24 jam) seiring waktu; itu perilaku yang benar.
 */
class FuasDemoSeeder extends Seeder
{
    /** Urutan pola dari order TERBARU ke yang lebih lama (disesuaikan dengan kelayakan umur). */
    private const NEWEST_FIRST_PATTERN = [
        FuasStatusService::TO_SEND,
        FuasStatusService::TO_SEND,
        FuasStatusService::SENT_1,
        FuasStatusService::TO_SEND,
        FuasStatusService::SENT_1,
        FuasStatusService::SENT_2,
        FuasStatusService::REMINDER_DUE,
        FuasStatusService::FEEDBACK_RECEIVED,
        FuasStatusService::REMINDER_DUE,
        FuasStatusService::FEEDBACK_RECEIVED,
        FuasStatusService::NO_FEEDBACK,
        FuasStatusService::FEEDBACK_RECEIVED,
    ];

    /** Order yang lebih lama dari pola di atas bergantian memakai urutan ini. */
    private const OLDER_CYCLE = [
        FuasStatusService::FEEDBACK_RECEIVED,
        FuasStatusService::NO_FEEDBACK,
        FuasStatusService::FEEDBACK_RECEIVED,
        FuasStatusService::FEEDBACK_RECEIVED,
    ];

    /** Umur minimal (jam sejak order eligible) agar sebuah status bisa dibuat konsisten. */
    private const MIN_AGE_HOURS = [
        FuasStatusService::TO_SEND => 0,
        FuasStatusService::SENT_1 => 1,
        FuasStatusService::FEEDBACK_RECEIVED => 2,
        FuasStatusService::REMINDER_DUE => 25,
        FuasStatusService::SENT_2 => 26,
        FuasStatusService::NO_FEEDBACK => 50,
    ];

    /** Bila umur belum cukup, turun ke status yang lebih "muda". */
    private const FALLBACK = [
        FuasStatusService::NO_FEEDBACK => FuasStatusService::REMINDER_DUE,
        FuasStatusService::SENT_2 => FuasStatusService::SENT_1,
        FuasStatusService::REMINDER_DUE => FuasStatusService::SENT_1,
        FuasStatusService::FEEDBACK_RECEIVED => FuasStatusService::SENT_1,
        FuasStatusService::SENT_1 => FuasStatusService::TO_SEND,
    ];

    private Carbon $now;

    public function run(): void
    {
        if (app()->isProduction() && ! env('ALLOW_DEMO_SEED')) {
            $this->command?->error('FuasDemoSeeder dihentikan: environment production. Jalankan di database lokal/staging.');

            return;
        }

        mt_srand(20261008); // deterministik: pola sama tiap dijalankan (waktu tetap relatif terhadap "sekarang")
        $this->now = Carbon::now();

        $service = app(FuasStatusService::class);

        $eligible = ServiceOrder::query()
            ->where('status', ServiceOrder::STATUS_COMPLETED)
            ->whereNotNull('status_changed_at')
            ->whereDoesntHave('fuas')
            ->get(['id', 'service_advisor_id', 'work_order_number', 'status_changed_at'])
            ->map(function (ServiceOrder $o) use ($service) {
                $eligibleAt = Carbon::instance($service->eligibleAt($o->status_changed_at));

                return [
                    'order' => $o,
                    'eligible_at' => $eligibleAt,
                    'age_hours' => ($this->now->timestamp - $eligibleAt->timestamp) / 3600,
                ];
            })
            // Belum 4 x 24 jam: bukan bagian FUAS (aturan 1 FuasStatusService).
            ->filter(fn (array $r) => $r['age_hours'] >= 0)
            // Terbaru dulu, supaya pola dimulai dari status yang paling "muda".
            ->sortBy('age_hours')
            ->values();

        if ($eligible->isEmpty()) {
            $this->command?->warn('Tidak ada order completed yang eligible (>= 4 x 24 jam) dan belum punya FUAS. Dilewati. '
                . 'Jalankan DemoDataSeeder dulu bila belum.');

            return;
        }

        $counts = [];
        $planned = []; // order id => status yang direncanakan

        DB::transaction(function () use ($eligible, &$counts, &$planned) {
            foreach ($eligible as $i => $row) {
                $status = $this->pickStatus($i, $row['age_hours']);
                $planned[$row['order']->id] = $status;

                if ($status === FuasStatusService::TO_SEND) {
                    // Tanpa baris FUAS: persis kondisi nyata sebelum SA menekan "Send via WhatsApp".
                    $counts[$status] = ($counts[$status] ?? 0) + 1;

                    continue;
                }

                $this->insertFuas($row['order'], $row['eligible_at'], $status);
                $counts[$status] = ($counts[$status] ?? 0) + 1;
            }
        });

        // Verifikasi: status yang dihitung FuasStatusService harus sama dengan yang direncanakan.
        $mismatch = 0;
        foreach ($planned as $orderId => $expected) {
            $fresh = ServiceOrder::with('fuas')->find($orderId);
            if ($service->forOrder($fresh, null, $this->now->toDateTimeImmutable()) !== $expected) {
                $mismatch++;
            }
        }

        $this->command?->info('FUAS demo dibuat untuk ' . $eligible->count() . ' order completed: ' . $this->summary($counts) . '.');
        if ($mismatch > 0) {
            $this->command?->warn("{$mismatch} order berstatus FUAS berbeda dari rencana seeder; periksa FuasStatusService / status_changed_at.");
        }
    }

    // ------------------------------------------------------------------
    // Pemilihan status
    // ------------------------------------------------------------------

    private function pickStatus(int $indexNewestFirst, float $ageHours): string
    {
        $pattern = self::NEWEST_FIRST_PATTERN;
        $status = $pattern[$indexNewestFirst]
            ?? self::OLDER_CYCLE[($indexNewestFirst - count($pattern)) % count(self::OLDER_CYCLE)];

        while ($ageHours < self::MIN_AGE_HOURS[$status]) {
            $status = self::FALLBACK[$status];
        }

        return $status;
    }

    // ------------------------------------------------------------------
    // Pembuatan baris FUAS per status
    // ------------------------------------------------------------------

    private function insertFuas(ServiceOrder $order, Carbon $eligibleAt, string $status): void
    {
        $now = $this->now;
        $min = fn (int $m) => $now->copy()->subMinutes($m);
        $window = FuasStatusService::WINDOW_HOURS;

        $sentCount = 1;
        $first = $last = $submittedAt = null;

        switch ($status) {
            case FuasStatusService::SENT_1:
                // Terkirim sekali, masih di dalam jendela 24 jam.
                $last = $this->between(Carbon::createFromTimestamp(max($eligibleAt->timestamp, $now->copy()->subHours($window - 1)->timestamp)), $min(10));
                $first = $last;
                break;

            case FuasStatusService::REMINDER_DUE:
                // Terkirim sekali, jendela 24 jam sudah lewat.
                $hi = $now->copy()->subHours($window)->subMinutes(10);
                $lo = Carbon::createFromTimestamp(max($eligibleAt->timestamp, $hi->copy()->subDays(3)->timestamp));
                $last = $this->between($lo, $hi);
                $first = $last;
                break;

            case FuasStatusService::SENT_2:
                $sentCount = 2;
                $lo = Carbon::createFromTimestamp(max(
                    $eligibleAt->copy()->addHours($window)->addMinutes(5)->timestamp,
                    $now->copy()->subHours($window - 1)->timestamp,
                ));
                $last = $this->between($lo, $min(10));
                $first = $this->between($eligibleAt, $last->copy()->subHours($window)->subMinutes(5));
                break;

            case FuasStatusService::NO_FEEDBACK:
                $sentCount = 2;
                $hi = $now->copy()->subHours($window)->subMinutes(10);
                $lo = Carbon::createFromTimestamp(max(
                    $eligibleAt->copy()->addHours($window)->addMinutes(5)->timestamp,
                    $hi->copy()->subDays(3)->timestamp,
                ));
                $last = $this->between($lo, $hi);
                $first = $this->between($eligibleAt, $last->copy()->subHours($window)->subMinutes(5));
                break;

            case FuasStatusService::FEEDBACK_RECEIVED:
                // Umur >= 30 jam: boleh dua kali kirim; selain itu satu kali.
                $ageHours = ($now->timestamp - $eligibleAt->timestamp) / 3600;
                $sentCount = ($ageHours >= 30 && mt_rand(1, 100) <= 40) ? 2 : 1;

                if ($sentCount === 2) {
                    $first = $this->between($eligibleAt, $now->copy()->subHours($window + 1)->subMinutes(15));
                    $last = $this->between(
                        $first->copy()->addHours($window)->addMinutes(5),
                        Carbon::createFromTimestamp(min($first->copy()->addHours(48)->timestamp, $min(30)->timestamp)),
                    );
                    // Link masih terbuka saat diisi: paling lambat 24 jam sejak kirim terakhir.
                    $submittedAt = $this->between(
                        $last->copy()->addMinutes(5),
                        Carbon::createFromTimestamp(min($now->copy()->subMinute()->timestamp, $last->copy()->addHours($window - 1)->timestamp)),
                    );
                } else {
                    $first = $last = $this->between($eligibleAt, $min(60));
                    $submittedAt = $this->between($first->copy()->addMinutes(5), $min(1));
                }
                break;
        }

        $row = [
            'service_order_id' => $order->id,
            'feedback_token' => $this->newToken(),
            'sent_count' => $sentCount,
            'first_sent_at' => $first,
            'last_sent_at' => $last,
            'last_sent_by' => $order->service_advisor_id,
            'submitted_at' => $submittedAt,
            'satisfaction_score' => null,
            'recommend_score' => null,
            'vehicle_issue_note' => null,
            'suggestion' => null,
            'suggestion_categories' => null,
            'created_at' => $first->copy()->subMinute(),
            'updated_at' => $submittedAt ?? $last,
        ];

        if ($submittedAt !== null) {
            $row = array_merge($row, $this->buildAnswers());
        }

        DB::table('service_order_fuas')->insert($row);
    }

    // ------------------------------------------------------------------
    // Isi feedback
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function buildAnswers(): array
    {
        $satisfaction = $this->weightedScore();
        $recommend = max(1, min(10, $satisfaction + mt_rand(-1, 1)));
        $low = $satisfaction <= 6;

        $issueNotes = $low
            ? [
                'Masih ada bunyi di kaki depan saat melewati polisi tidur.',
                'AC belum sedingin yang saya harapkan setelah servis.',
                'Setir masih sedikit bergetar di kecepatan tinggi.',
                'Lampu indikator sempat menyala lagi di hari kedua.',
            ]
            : [
                'Tidak ada',
                'Tidak ada',
                'Tidak ada kendala, mobil terasa lebih halus.',
                'Tidak ada kendala sampai sekarang.',
                'Semua normal setelah servis.',
            ];

        $suggestionsLow = [
            'Mohon update progres pengerjaan lebih sering lewat WhatsApp.',
            'Estimasi waktu selesai sebaiknya lebih akurat, kemarin molor setengah hari.',
            'Proses serah terima kendaraan agak lama, mohon dipercepat.',
        ];
        $suggestionsHigh = [
            'Pelayanan sudah baik, pertahankan.',
            'Video dari teknisi sangat membantu, terima kasih.',
            'Service Advisor ramah dan responsif.',
            'Ruang tunggu nyaman, mungkin bisa ditambah pilihan minuman.',
        ];

        $suggestion = null;
        $categories = null;

        if (mt_rand(1, 100) <= ($low ? 90 : 55)) {
            $pool = $low ? $suggestionsLow : $suggestionsHigh;
            $suggestion = $pool[mt_rand(0, count($pool) - 1)];

            $keys = array_keys(ServiceOrderFuas::CATEGORIES);
            $this->shuffle($keys);
            $categories = array_slice($keys, 0, mt_rand(1, 3));
        }

        return [
            'satisfaction_score' => $satisfaction,
            'recommend_score' => $recommend,
            'vehicle_issue_note' => $issueNotes[mt_rand(0, count($issueNotes) - 1)],
            'suggestion' => $suggestion,
            'suggestion_categories' => $categories === null ? null : json_encode($categories),
        ];
    }

    /** Skor 1-10, condong tinggi seperti survei kepuasan bengkel pada umumnya. */
    private function weightedScore(): int
    {
        $bag = [10, 10, 10, 9, 9, 9, 9, 8, 8, 8, 7, 7, 6, 5, 3];

        return $bag[mt_rand(0, count($bag) - 1)];
    }

    // ------------------------------------------------------------------
    // Util
    // ------------------------------------------------------------------

    /** feedback_token MUST berbeda dari inspection_token dan unik (RULE-038). */
    private function newToken(): string
    {
        do {
            $token = Str::random(32);
        } while (
            DB::table('service_order_fuas')->where('feedback_token', $token)->exists()
            || DB::table('service_orders')->where('inspection_token', $token)->exists()
        );

        return $token;
    }

    /** Waktu acak di antara $a dan $b; bila rentang terbalik, kembalikan $a. */
    private function between(Carbon $a, Carbon $b): Carbon
    {
        $secs = $b->timestamp - $a->timestamp;

        return $secs <= 0 ? $a->copy() : $a->copy()->addSeconds(mt_rand(0, $secs));
    }

    /** Fisher-Yates dengan mt_rand supaya hasil deterministik setelah mt_srand(). */
    private function shuffle(array &$arr): void
    {
        for ($i = count($arr) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
        }
    }

    /** @param array<string, int> $counts */
    private function summary(array $counts): string
    {
        $labels = [
            FuasStatusService::TO_SEND => 'To Send',
            FuasStatusService::SENT_1 => 'Sent (1)',
            FuasStatusService::REMINDER_DUE => 'Reminder Due',
            FuasStatusService::SENT_2 => 'Sent (2)',
            FuasStatusService::NO_FEEDBACK => 'No Feedback',
            FuasStatusService::FEEDBACK_RECEIVED => 'Feedback Received',
        ];

        $parts = [];
        foreach ($labels as $key => $label) {
            if (! empty($counts[$key])) {
                $parts[] = "{$label} {$counts[$key]}";
            }
        }

        return implode(', ', $parts);
    }
}