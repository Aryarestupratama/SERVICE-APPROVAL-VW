<?php

namespace App\Services;

use App\Models\ServiceOrder;
use App\Models\ServiceOrderFuas;
use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;

/**
 * Satu-satunya tempat status FUAS dihitung (RULE-036, ADR-011).
 *
 * Status diturunkan dari timestamp saat request: tidak disimpan, tidak butuh cron,
 * dan klien tidak boleh menghitung ulang. Aturan: Schema.md bagian 5A.
 */
class FuasStatusService
{
    public const ELIGIBLE_AFTER_HOURS = 96;   // 4 x 24 jam sejak status_changed_at (completed)
    public const WINDOW_HOURS = 24;           // jeda antar kirim / penutupan link sejak last_sent_at
    public const MAX_SENT = 2;

    public const TO_SEND = 'to_send';
    public const SENT_1 = 'sent_1';
    public const REMINDER_DUE = 'reminder_due';
    public const SENT_2 = 'sent_2';
    public const NO_FEEDBACK = 'no_feedback';
    public const FEEDBACK_RECEIVED = 'feedback_received';

    public const LIST_IN_PROCESS = 'in_process';
    public const LIST_COMPLETED = 'completed';

    /** Status yang tampil di tiap daftar (Schema.md 5A); urutan = prioritas tampil default. */
    public const IN_PROCESS_STATUSES = [self::REMINDER_DUE, self::TO_SEND, self::SENT_1, self::SENT_2];
    public const COMPLETED_STATUSES = [self::NO_FEEDBACK, self::FEEDBACK_RECEIVED];

    /**
     * Status FUAS sebuah order, atau null bila belum/tidak masuk FUAS.
     * Pembungkus tipis di atas resolve(); tanpa baris FUAS dianggap sent_count 0.
     */
    public function forOrder(ServiceOrder $order, ?ServiceOrderFuas $fuas = null, ?DateTimeInterface $now = null): ?string
    {
        $fuas ??= $order->fuas;

        return $this->resolve(
            $order->status,
            $order->status_changed_at,
            (int) ($fuas?->sent_count ?? 0),
            $fuas?->last_sent_at,
            $fuas?->submitted_at,
            $now ?? new DateTimeImmutable('now'),
        );
    }

    /**
     * Inti aturan 7 baris (Schema.md 5A), evaluasi berurutan, berhenti pada kecocokan pertama.
     * Murni: hanya bergantung pada argumen, jadi mudah diuji.
     */
    public function resolve(
        string $orderStatus,
        ?DateTimeInterface $statusChangedAt,
        int $sentCount,
        ?DateTimeInterface $lastSentAt,
        ?DateTimeInterface $submittedAt,
        DateTimeInterface $now,
    ): ?string {
        // 1. Belum completed, atau belum 4 x 24 jam: tidak masuk FUAS.
        if ($orderStatus !== ServiceOrder::STATUS_COMPLETED || $statusChangedAt === null) {
            return null;
        }
        if ($now < $this->eligibleAt($statusChangedAt)) {
            return null;
        }

        // 2. Customer sudah mengisi.
        if ($submittedAt !== null) {
            return self::FEEDBACK_RECEIVED;
        }

        // 3. Belum pernah dikirim.
        if ($sentCount <= 0) {
            return self::TO_SEND;
        }

        // Tanpa last_sent_at padahal sent_count >= 1 (data tidak konsisten): anggap jendela sudah lewat.
        $windowEnded = $lastSentAt === null || $now >= $this->windowEnd($lastSentAt);

        if ($sentCount === 1) {
            return $windowEnded ? self::REMINDER_DUE : self::SENT_1;    // 5 / 4
        }

        return $windowEnded ? self::NO_FEEDBACK : self::SENT_2;         // 7 / 6
    }

    public function eligibleAt(DateTimeInterface $statusChangedAt): DateTimeImmutable
    {
        return DateTimeImmutable::createFromInterface($statusChangedAt)
            ->modify('+' . self::ELIGIBLE_AFTER_HOURS . ' hours');
    }

    public function windowEnd(DateTimeInterface $lastSentAt): DateTimeImmutable
    {
        return DateTimeImmutable::createFromInterface($lastSentAt)
            ->modify('+' . self::WINDOW_HOURS . ' hours');
    }

    /** Tombol "Send via WhatsApp" aktif hanya pada To Send dan Reminder Due. */
    public function canSend(?string $status): bool
    {
        return $status === self::TO_SEND || $status === self::REMINDER_DUE;
    }

    /** Daftar tempat status ini tampil; null bila tidak masuk FUAS. */
    public function listFor(?string $status): ?string
    {
        return match ($status) {
            null => null,
            self::FEEDBACK_RECEIVED, self::NO_FEEDBACK => self::LIST_COMPLETED,
            default => self::LIST_IN_PROCESS,
        };
    }

    /** @return list<string> */
    public function statusesForList(string $list): array
    {
        return $list === self::LIST_COMPLETED ? self::COMPLETED_STATUSES : self::IN_PROCESS_STATUSES;
    }

    /**
     * Membatasi query ke order yang masuk sebuah daftar FUAS (TASK-030), di SQL supaya
     * search/filter/sort/pagination tetap di server (RULE-022).
     *
     * Ini CERMIN SQL dari resolve() di kelas yang sama (RULE-036: satu tempat). Tampilan status
     * tiap baris tetap dari resolve(); bila aturan di resolve() berubah, ubah sqlCondition() juga.
     * Query MUST sudah men-join `service_order_fuas as f` (leftJoin) dan memakai tabel `service_orders`.
     *
     * @param  list<string>|null  $onlyStatuses  batasi ke subset status daftar ini (filter UI), null = semua status daftar
     */
    public function applyList(Builder $query, string $list, ?array $onlyStatuses, DateTimeInterface $now): Builder
    {
        $statuses = $this->statusesForList($list);
        if ($onlyStatuses !== null) {
            $statuses = array_values(array_intersect($statuses, $onlyStatuses));
        }

        $query->where('service_orders.status', ServiceOrder::STATUS_COMPLETED)
            ->where('service_orders.status_changed_at', '<=', $this->cutoff($now, self::ELIGIBLE_AFTER_HOURS));

        if ($statuses === []) {
            return $query->whereRaw('1 = 0');
        }

        $parts = [];
        $bindings = [];
        foreach ($statuses as $status) {
            [$sql, $b] = $this->sqlCondition($status, $now);
            $parts[] = "({$sql})";
            array_push($bindings, ...$b);
        }

        return $query->whereRaw('(' . implode(' OR ', $parts) . ')', $bindings);
    }

    /**
     * Ekspresi urutan prioritas (Reminder Due, To Send, Sent (1), Sent (2), No Feedback, Feedback Received).
     *
     * @return array{0: string, 1: list<string>} [sql, bindings]
     */
    public function sqlPriority(DateTimeInterface $now): array
    {
        $order = [
            self::REMINDER_DUE, self::TO_SEND, self::SENT_1, self::SENT_2,
            self::NO_FEEDBACK, self::FEEDBACK_RECEIVED,
        ];

        $sql = 'CASE';
        $bindings = [];
        foreach ($order as $rank => $status) {
            [$cond, $b] = $this->sqlCondition($status, $now);
            $sql .= " WHEN ({$cond}) THEN {$rank}";
            array_push($bindings, ...$b);
        }

        return [$sql . ' ELSE ' . count($order) . ' END', $bindings];
    }

    /**
     * Kondisi SQL satu status, mengikuti urutan evaluasi resolve() (baris 2-7; baris 1 = eligible di applyList).
     *
     * @return array{0: string, 1: list<string>} [sql, bindings]
     */
    public function sqlCondition(string $status, DateTimeInterface $now): array
    {
        $windowCutoff = $this->cutoff($now, self::WINDOW_HOURS);
        $notSubmitted = 'f.submitted_at IS NULL';

        return match ($status) {
            self::FEEDBACK_RECEIVED => ['f.submitted_at IS NOT NULL', []],
            self::TO_SEND => ["{$notSubmitted} AND COALESCE(f.sent_count, 0) <= 0", []],
            self::SENT_1 => [
                "{$notSubmitted} AND f.sent_count = 1 AND f.last_sent_at IS NOT NULL AND f.last_sent_at > ?",
                [$windowCutoff],
            ],
            self::REMINDER_DUE => [
                "{$notSubmitted} AND f.sent_count = 1 AND (f.last_sent_at IS NULL OR f.last_sent_at <= ?)",
                [$windowCutoff],
            ],
            self::SENT_2 => [
                "{$notSubmitted} AND f.sent_count >= 2 AND f.last_sent_at IS NOT NULL AND f.last_sent_at > ?",
                [$windowCutoff],
            ],
            self::NO_FEEDBACK => [
                "{$notSubmitted} AND f.sent_count >= 2 AND (f.last_sent_at IS NULL OR f.last_sent_at <= ?)",
                [$windowCutoff],
            ],
            default => ['1 = 0', []],
        };
    }

    /** Batas waktu (now - N jam) sebagai string DB, dalam zona waktu objek $now (zona aplikasi). */
    private function cutoff(DateTimeInterface $now, int $hours): string
    {
        return DateTimeImmutable::createFromInterface($now)->modify("-{$hours} hours")->format('Y-m-d H:i:s');
    }

    /**
     * Link feedback aktif bila sudah dikirim minimal sekali, belum diisi, dan bukan
     * (sent_count = 2 dan jendela terakhir sudah lewat). Dipakai halaman publik (TASK-032).
     */
    public function isFeedbackLinkActive(
        int $sentCount,
        ?DateTimeInterface $lastSentAt,
        ?DateTimeInterface $submittedAt,
        DateTimeInterface $now,
    ): bool {
        if ($sentCount < 1 || $submittedAt !== null) {
            return false;
        }

        if ($sentCount >= self::MAX_SENT) {
            return $lastSentAt !== null && $now < $this->windowEnd($lastSentAt);
        }

        return true;
    }
}
