<?php

namespace App\Services;

use App\Models\Vehicle;
use Illuminate\Support\Str;

class VehicleCustomerImportService
{
    /**
     * Kolom Excel FIXED per index (bukan named heading) — file sumber
     * (Customer_and_vehicle_master.xlsx) urutannya: No Chassis, No. Polisi,
     * Brand, Variant, Contact Name, primary, Phone. Dipakai by-index supaya
     * tidak bergantung ke penamaan header yang bisa berubah antar export.
     */
    private const COL_VIN = 0;
    private const COL_PLATE = 1;
    private const COL_BRAND = 2;
    private const COL_MODEL = 3;
    private const COL_CONTACT_NAME = 4;
    private const COL_PRIMARY_NAME = 5;
    private const COL_PHONE = 6;

    /**
     * Parse raw rows (array of array, row 0 = header) jadi struktur siap-preview.
     * Baris kosong bawaan Excel (tidak ada vin/plate/primary) di-skip total,
     * tidak masuk hitungan/preview sama sekali (sesuai profiling PROJECT-RULES.md).
     */
    public function parseRows(array $rawRows): array
    {
        $dataRows = array_slice($rawRows, 1); // buang header

        $parsed = [];
        $rowId = 0;

        foreach ($dataRows as $excelRowNumber => $row) {
            $vin = $this->cell($row, self::COL_VIN);
            $plate = $this->cell($row, self::COL_PLATE);
            $primaryName = $this->cell($row, self::COL_PRIMARY_NAME);

            // Baris kosong bawaan file — skip total, tidak dihitung.
            if ($vin === null && $plate === null && $primaryName === null) {
                continue;
            }

            $contactNameRaw = $this->cell($row, self::COL_CONTACT_NAME);
            $brandRaw = $this->cell($row, self::COL_BRAND);
            $phoneRaw = $this->cell($row, self::COL_PHONE);

            $vin = strtoupper(trim((string) $vin));
            $plate = trim((string) $plate);
            $primaryName = trim((string) $primaryName);
            $contactName = $contactNameRaw !== null ? trim((string) $contactNameRaw) : null;
            $brand = $this->normalizeBrand((string) $brandRaw);
            $model = trim((string) $this->cell($row, self::COL_MODEL));
            $phoneClean = $this->cleanPhone((string) $phoneRaw);

            $model = $this->stripBrandPrefix($model, $brand);

            // Auto-dedupe: Contact Name == primary (case-insensitive) →
            // dianggap 1 customer saja, TIDAK butuh review manual (keputusan owner FINAL).
            $isContactDedup = $contactName !== null
                && $contactName !== ''
                && Str::lower($contactName) === Str::lower($primaryName);

            $issues = [];

            if (strlen($vin) !== 17) {
                $issues[] = 'vin_length';
            }

            $parsed[] = [
                'row_id' => $rowId++,
                'excel_row' => $excelRowNumber + 2, // +1 skip header, +1 index->1-based
                'vin' => $vin,
                'plate_number' => $plate,
                'brand' => $brand,
                'model' => $model,
                'primary_name' => $primaryName,
                'contact_name' => ($contactName === '' || $isContactDedup) ? null : $contactName,
                'contact_deduped' => $isContactDedup,
                'phone' => $phoneClean,
                'issues' => $issues,
            ];
        }

        // Tahap 2: deteksi plat duplikat LINTAS baris (butuh full list dulu).
        $plateCounts = [];
        foreach ($parsed as $row) {
            $plateCounts[$row['plate_number']] = ($plateCounts[$row['plate_number']] ?? 0) + 1;
        }

        foreach ($parsed as &$row) {
            if (($plateCounts[$row['plate_number']] ?? 0) > 1) {
                $row['issues'][] = 'duplicate_plate';
            }
            // Default 'included': bersih otomatis true, ada issue butuh opt-in manual.
            $row['included'] = empty($row['issues']);
        }
        unset($row);

        return $parsed;
    }

    /** AUDI/VW (atau variasi casing lain) → Title Case sesuai Vehicle::BRANDS. */
    private function normalizeBrand(string $raw): string
    {
        $raw = trim($raw);
        foreach (Vehicle::BRANDS as $brand) {
            if (Str::lower($brand) === Str::lower($raw)) {
                return $brand;
            }
        }
        return $raw; // biarkan apa adanya kalau tidak dikenal — akan gagal validasi saat commit, jelas keliatan di UI.
    }

    /**
     * Buang semua karakter non-digit (termasuk suffix teks seperti " jual").
     * Normalisasi lanjutan (format 62xxx) tetap ditangani oleh Customer::phone()
     * mutator saat model disimpan — tidak dobel logic di sini.
     */
    private function cleanPhone(string $raw): string
    {
        return preg_replace('/\D/', '', $raw) ?? '';
    }

    /**
     * Buang prefix nama brand dari model kalau sudah ikut ketulis di sana
     * (case-insensitive, exact word match di awal string). Contoh:
     * brand="AUDI", model="Audi A6" → "A6". Kalau model TIDAK diawali nama
     * brand, dibiarkan apa adanya (tidak ada perubahan).
     */
    private function stripBrandPrefix(string $model, string $brand): string
    {
        $brand = trim($brand);
        if ($brand === '' || $model === '') {
            return $model;
        }

        // Match brand diikuti spasi/akhir string, case-insensitive.
        $pattern = '/^' . preg_quote($brand, '/') . '\s+/i';
        return trim(preg_replace($pattern, '', $model));
    }

    private function cell(array $row, int $index): ?string
    {
        $value = $row[$index] ?? null;
        if ($value === null) return null;
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }
}