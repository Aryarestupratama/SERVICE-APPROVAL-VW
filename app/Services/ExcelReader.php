<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use Illuminate\Http\UploadedFile;

/**
 * Read filter untuk batasi baris yang dibaca ke PhpSpreadsheet — sumber file
 * (Customer_and_vehicle_master.xlsx) punya dimensi sheet sampai 59.108 baris
 * padahal cuma ~1.295 baris valid. Tanpa filter ini, load() mengalokasikan
 * cell object untuk SEMUA baris (termasuk yang kosong) dan menghabiskan
 * memory_limit default PHP (128M). Batas MAX_ROW sengaja dilebihkan jauh dari
 * kebutuhan aktual (bukan di-hardcode ke 1295) supaya tetap aman kalau file
 * sumber diupdate owner dengan baris data baru di masa depan.
 */
class BoundedRowReadFilter implements IReadFilter
{
    public function __construct(private int $maxRow = 20000) {}

    public function readCell(string $columnAddress, int $row, string $worksheetName = ''): bool
    {
        return $row <= $this->maxRow;
    }
}

class ExcelReader
{
    public function readFirstSheet(UploadedFile $file): array
    {
        // Bump sementara untuk request ini saja — jaga-jaga kalau suatu saat
        // file sumber jauh lebih besar dari yang di-test sekarang. Filter di
        // bawah adalah pertahanan UTAMA, ini cuma jaring pengaman kedua.
        ini_set('memory_limit', '512M');

        $reader = IOFactory::createReaderForFile($file->getRealPath());
        $reader->setReadDataOnly(true); // skip semua style/formatting, kita cuma butuh value
        $reader->setReadFilter(new BoundedRowReadFilter());

        $spreadsheet = $reader->load($file->getRealPath());
        $sheet = $spreadsheet->getActiveSheet();

        return $sheet->toArray(null, true, true, false);
    }
}