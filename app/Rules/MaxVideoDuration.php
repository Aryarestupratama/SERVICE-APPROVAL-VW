<?php

namespace App\Rules;

use Closure;
use getID3;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

/**
 * Validasi durasi video maksimal N detik, dibaca dari metadata file lewat
 * getID3 (pure PHP, BUKAN binary FFmpeg — lihat PROJECT-RULES.md bagian 9.2
 * & 9.4). Ini lapisan validasi BACKEND — jangan andalkan cek durasi di
 * frontend saja, karena request bisa dikirim langsung tanpa lewat form JS.
 *
 * Dipakai untuk field upload video Service Order (batas final: 2 menit /
 * 120 detik, keputusan owner 2026-08-09).
 */
class MaxVideoDuration implements ValidationRule
{
    public function __construct(
        private readonly int $maxSeconds = 120,
    ) {
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!$value instanceof UploadedFile) {
            // Bukan file upload (mis. video_source = external_link) — bukan
            // tanggung jawab rule ini, biarkan lolos, validasi lain yang pegang.
            return;
        }

        $duration = $this->readDurationSeconds($value->getRealPath());

        if ($duration === null) {
            // Metadata durasi tidak terbaca sama sekali — file kemungkinan
            // corrupt/bukan video valid. Tolak daripada diam-diam meloloskan
            // video tanpa batas durasi yang bisa diverifikasi.
            $fail('File video tidak valid atau durasinya tidak bisa dibaca. Pastikan file adalah video yang valid.');
            return;
        }

        if ($duration > $this->maxSeconds) {
            $minutes = number_format($this->maxSeconds / 60, 1);
            $fail("Durasi video maksimal {$minutes} menit. Video ini berdurasi ".number_format($duration, 0)." detik.");
        }
    }

    /**
     * Baca durasi video dalam detik lewat getID3. Return null kalau metadata
     * durasi tidak ditemukan (file rusak/format tidak dikenali).
     */
    private function readDurationSeconds(string $filePath): ?float
    {
        $getID3 = new getID3();
        $info = $getID3->analyze($filePath);

        return $info['playtime_seconds'] ?? null;
    }
}