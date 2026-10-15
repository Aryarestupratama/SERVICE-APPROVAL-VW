<?php

namespace App\Services;

use App\Models\ServiceOrderFuas;
use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Membangun file Excel jawaban feedback FUAS untuk bagian CR (FR-037).
 *
 * Kelas ini hanya menyusun lembar kerja dari baris-baris array biasa (tanpa query), supaya
 * mudah diuji. Pembuatan baris dan pembatasan data ada di FuasExportController.
 *
 * Keamanan: isi jawaban berasal dari form publik (teks bebas customer), jadi SEMUA teks
 * ditulis sebagai string eksplisit. Tanpa itu, teks berawalan "=", "+", "-", atau "@"
 * bisa dibaca Excel sebagai rumus (formula injection). Lihat RULE-055.
 */
class FuasFeedbackExport
{
    public const SHEET_TITLE = 'FUAS Feedback';

    private const COLOR_WO = '161E59';        // vw-blue: data WO
    private const COLOR_FEEDBACK = '2B5BA8';  // biru lebih terang: jawaban feedback
    private const DATE_FORMAT = 'dd-mmm-yyyy hh:mm';

    /**
     * Kolom data WO lalu jawaban feedback: [kunci baris, judul kolom, lebar, jenis, grup].
     * Jenis: text | date | number | wrap (teks panjang, dibungkus).
     *
     * @return list<array{0: string, 1: string, 2: int, 3: string, 4: string}>
     */
    public function columns(): array
    {
        $columns = [
            ['work_order_number', 'WO Number', 16, 'text', 'wo'],
            ['completed_at', 'Completed At', 18, 'date', 'wo'],
            ['brand', 'Brand', 9, 'text', 'wo'],
            ['model', 'Model', 18, 'text', 'wo'],
            ['plate_number', 'Plate Number', 14, 'text', 'wo'],
            ['vin', 'VIN', 21, 'text', 'wo'],
            ['customer', 'Customer', 24, 'text', 'wo'],
            ['customer_phone', 'Customer Phone', 16, 'text', 'wo'],
            ['service_advisor', 'Service Advisor', 20, 'text', 'wo'],
            ['technician', 'Technician', 20, 'text', 'wo'],
            ['customer_complaint', 'Customer Complaint', 40, 'wrap', 'wo'],
            ['submitted_at', 'Submitted At', 18, 'date', 'feedback'],
            ['satisfaction_score', 'Satisfaction (1-10)', 14, 'number', 'feedback'],
            ['recommend_score', 'Likelihood to Recommend (1-10)', 16, 'number', 'feedback'],
            ['vehicle_issue_note', 'Vehicle Issue After Service', 45, 'wrap', 'feedback'],
            ['suggestion', 'Suggestions', 45, 'wrap', 'feedback'],
        ];

        // Satu kolom Yes/No per kategori supaya CR mudah memfilter atau membuat pivot.
        foreach (ServiceOrderFuas::CATEGORIES as $key => $label) {
            // Awalan "Category:" supaya tidak kembar dengan kolom "Service Advisor" data WO.
            $columns[] = ['category:' . $key, 'Category: ' . $label, 16, 'text', 'feedback'];
        }

        return $columns;
    }

    /**
     * @param  iterable<array<string, mixed>>  $rows  satu baris per feedback; kunci sesuai columns(),
     *                                                `categories` = daftar kunci kategori yang dipilih
     */
    public function build(iterable $rows, ?string $periodLabel = null): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->getProperties()
            ->setCreator('VW PIK Service Inspection')
            ->setTitle('FUAS customer feedback' . ($periodLabel ? " ({$periodLabel})" : ''));

        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle(self::SHEET_TITLE);

        $columns = $this->columns();
        $this->writeHeader($sheet, $columns);

        $rowIndex = 1;
        foreach ($rows as $row) {
            $rowIndex++;
            $this->writeRow($sheet, $rowIndex, $columns, $row);
        }

        $lastColumn = Coordinate::stringFromColumnIndex(count($columns));
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:{$lastColumn}" . max($rowIndex, 2));

        if ($rowIndex > 1) {
            $sheet->getStyle("A2:{$lastColumn}{$rowIndex}")
                ->getAlignment()->setVertical(Alignment::VERTICAL_TOP);
        }

        return $spreadsheet;
    }

    /** @param list<array{0: string, 1: string, 2: int, 3: string, 4: string}> $columns */
    private function writeHeader(Worksheet $sheet, array $columns): void
    {
        foreach ($columns as $i => [, $title, $width, , $group]) {
            $letter = Coordinate::stringFromColumnIndex($i + 1);

            $sheet->setCellValueExplicit("{$letter}1", $title, DataType::TYPE_STRING);
            $sheet->getColumnDimension($letter)->setWidth($width);

            $style = $sheet->getStyle("{$letter}1");
            $style->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
            $style->getFill()->setFillType(Fill::FILL_SOLID)
                ->getStartColor()->setRGB($group === 'wo' ? self::COLOR_WO : self::COLOR_FEEDBACK);
            $style->getAlignment()
                ->setVertical(Alignment::VERTICAL_CENTER)
                ->setWrapText(true);
        }

        $sheet->getRowDimension(1)->setRowHeight(32);
    }

    /**
     * @param  list<array{0: string, 1: string, 2: int, 3: string, 4: string}>  $columns
     * @param  array<string, mixed>  $row
     */
    private function writeRow(Worksheet $sheet, int $rowIndex, array $columns, array $row): void
    {
        $selected = is_array($row['categories'] ?? null) ? $row['categories'] : [];

        foreach ($columns as $i => [$key, , , $type]) {
            $cell = Coordinate::stringFromColumnIndex($i + 1) . $rowIndex;

            if (str_starts_with($key, 'category:')) {
                $value = in_array(substr($key, 9), $selected, true) ? 'Yes' : 'No';
            } else {
                $value = $row[$key] ?? null;
            }

            if ($value === null || $value === '') {
                continue;
            }

            switch ($type) {
                case 'date':
                    if ($value instanceof DateTimeInterface) {
                        $sheet->setCellValueExplicit($cell, $this->excelSerial($value), DataType::TYPE_NUMERIC);
                        $sheet->getStyle($cell)->getNumberFormat()->setFormatCode(self::DATE_FORMAT);
                    }
                    break;

                case 'number':
                    $sheet->setCellValueExplicit($cell, (int) $value, DataType::TYPE_NUMERIC);
                    $sheet->getStyle($cell)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
                    break;

                case 'wrap':
                    $sheet->setCellValueExplicit($cell, (string) $value, DataType::TYPE_STRING);
                    $sheet->getStyle($cell)->getAlignment()->setWrapText(true);
                    break;

                default:
                    // RULE-055: selalu string eksplisit (anti formula injection).
                    $sheet->setCellValueExplicit($cell, (string) $value, DataType::TYPE_STRING);
            }
        }
    }

    /**
     * Excel tidak punya zona waktu: simpan jam dinding apa adanya (Asia/Jakarta, sama dengan yang
     * dilihat pengguna di aplikasi). Dihitung dari komponen tanggal-jam, bukan dari epoch zona lokal.
     */
    private function excelSerial(DateTimeInterface $value): float
    {
        $wall = new DateTimeImmutable($value->format('Y-m-d H:i:s'), new DateTimeZone('UTC'));

        return $wall->getTimestamp() / 86400 + 25569;
    }
}
