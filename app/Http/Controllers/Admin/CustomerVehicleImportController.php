<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerVehicle;
use App\Models\Vehicle;
use App\Services\ExcelReader;
use App\Services\VehicleCustomerImportService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;

class CustomerVehicleImportController extends Controller
{
    private const SESSION_KEY = 'vehicle_customer_import_rows';
    private const FAILED_KEY = 'vehicle_customer_import_failed_rows';

    public function __construct(
        private ExcelReader $reader,
        private VehicleCustomerImportService $importService,
    ) {}

    public function create()
    {
        return Inertia::render('Admin/Imports/VehicleCustomerImport', [
            'rows' => session(self::SESSION_KEY),
            // Detail baris yang gagal dari commit terakhir (kalau ada).
            // Dibersihkan saat upload baru, cancel, atau dismiss di halaman.
            'failedRows' => session(self::FAILED_KEY),
        ]);
    }

    /**
     * Upload file → parse → validasi format vs data existing di DB (VIN/plat
     * sudah ada?) → simpan hasil parse ke session → return ke frontend untuk
     * di-review. TIDAK menulis apapun ke database di step ini.
     */
    public function preview(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls', 'max:10240'], // 10 MB
        ], [
            'file.mimes' => 'The file must be an .xlsx or .xls Excel file.',
            'file.max' => 'The file is too large (maximum 10 MB).',
        ]);

        session()->forget([self::SESSION_KEY, self::FAILED_KEY]);

        try {
            $rawRows = $this->reader->readFirstSheet($request->file('file'));
        } catch (\Throwable $e) {
            report($e);

            return back()->withErrors([
                'file' => 'Could not read the file. Make sure it is a valid, non-corrupted Excel file.',
            ]);
        }

        $parsedRows = $this->importService->parseRows($rawRows);

        if (empty($parsedRows)) {
            return back()->with('error', 'No data rows found in the file. Check that the data starts on row 2 and the columns follow the expected order.');
        }

        // Cross-check ke DB: vin/plate yang sudah ada di database ditandai
        // 'existing' — bukan error, tapi row perlu tahu ini akan UPDATE bukan CREATE.
        // Urutan pencocokan sama dengan commit(): VIN dulu, baru plat.
        $existingVins = $this->existingVehicleMap('vin', array_column($parsedRows, 'vin'));
        $existingPlates = $this->existingVehicleMap('plate_number', array_column($parsedRows, 'plate_number'));

        foreach ($parsedRows as &$row) {
            $row['existing_vehicle_id'] = $existingVins[$row['vin']]
                ?? $existingPlates[$row['plate_number']]
                ?? null;
        }
        unset($row);

        session([self::SESSION_KEY => $parsedRows]);

        return back()->with('success', 'File parsed. Please review the rows below before importing.');
    }

    /**
     * Commit — jalankan create/update berdasarkan hasil parse di session +
     * keputusan admin (row_id mana yang di-include untuk baris berisu).
     * excluded_row_ids: row_id yang sengaja di-skip meski flagged 'included'
     * default true (untuk baris yang issue-nya bersih, admin masih bisa
     * uncheck manual dari preview kalau mau).
     * Baris `blocking` (data wajib kosong / merk tidak dikenal) SELALU di-skip,
     * apapun yang dikirim klien.
     */
    public function commit(Request $request)
    {
        $validated = $request->validate([
            'excluded_row_ids' => ['array'],
            'excluded_row_ids.*' => ['integer'],
        ]);

        $rows = session(self::SESSION_KEY);

        if (empty($rows)) {
            return back()->with('error', 'No parsed data found. Please upload the file again.');
        }

        // ~1.300 baris x beberapa query bisa melewati max_execution_time hosting.
        if (function_exists('set_time_limit')) {
            @set_time_limit(180);
        }

        $excluded = array_flip($validated['excluded_row_ids'] ?? []);

        $summary = ['created_vehicles' => 0, 'updated_vehicles' => 0, 'created_customers' => 0, 'skipped' => 0];
        $failedRows = [];

        // Per-baris transaction terpisah — SENGAJA bukan 1 transaction untuk
        // seluruh batch. Kalau 1 baris gagal (mis. constraint DB), baris lain
        // yang valid tetap harus jalan, bukan ikut ke-rollback semua.
        // Counter dihitung di dalam closure lalu digabung HANYA kalau transaksi
        // berhasil, supaya baris yang di-rollback tidak ikut terhitung.
        foreach ($rows as $row) {
            if (isset($excluded[$row['row_id']])) {
                continue;
            }

            if (! empty($row['blocking'])) {
                $summary['skipped']++;
                continue;
            }

            try {
                $delta = DB::transaction(function () use ($row) {
                    $delta = ['created_vehicles' => 0, 'updated_vehicles' => 0, 'created_customers' => 0];

                    $primaryCustomer = $this->findOrCreateCustomer($row['primary_name'], $row['phone']);
                    if ($primaryCustomer->wasRecentlyCreated) {
                        $delta['created_customers']++;
                    }

                    $picCustomer = null;
                    if ($row['contact_name']) {
                        $picCustomer = $this->findOrCreateCustomer($row['contact_name'], $row['phone']);
                        if ($picCustomer->wasRecentlyCreated) {
                            $delta['created_customers']++;
                        }
                    }

                    // VIN diutamakan; plat hanya dipakai kalau VIN belum dikenal.
                    // (where vin OR plate bisa menangkap kendaraan yang salah.)
                    $vehicle = Vehicle::where('vin', $row['vin'])->first()
                        ?? Vehicle::where('plate_number', $row['plate_number'])->first();

                    $attributes = [
                        'plate_number' => $row['plate_number'],
                        'brand' => $row['brand'],
                        'vin' => $row['vin'],
                        'model' => $row['model'],
                    ];

                    if ($vehicle) {
                        $vehicle->update($attributes);
                        $delta['updated_vehicles']++;
                    } else {
                        $vehicle = Vehicle::create($attributes);
                        $delta['created_vehicles']++;
                    }

                    // CustomerVehicleObserver::saved() otomatis menurunkan primary
                    // lain dan menyinkronkan vehicles.customer_id.
                    CustomerVehicle::updateOrCreate(
                        ['customer_id' => $primaryCustomer->id, 'vehicle_id' => $vehicle->id],
                        ['is_primary' => true]
                    );

                    if ($picCustomer) {
                        CustomerVehicle::updateOrCreate(
                            ['customer_id' => $picCustomer->id, 'vehicle_id' => $vehicle->id],
                            ['is_primary' => false]
                        );
                    }

                    return $delta;
                });

                foreach ($delta as $key => $value) {
                    $summary[$key] += $value;
                }
            } catch (\Throwable $e) {
                report($e);

                $failedRows[] = [
                    'excel_row' => $row['excel_row'],
                    'plate_number' => $row['plate_number'],
                    'error' => $this->friendlyError($e),
                ];
            }
        }

        session()->forget(self::SESSION_KEY);

        $message = sprintf(
            'Import complete: %d vehicles created, %d updated, %d customers created, %d rows skipped, %d rows failed.',
            $summary['created_vehicles'],
            $summary['updated_vehicles'],
            $summary['created_customers'],
            $summary['skipped'],
            count($failedRows),
        );

        if (! empty($failedRows)) {
            // Baris yang sukses tetap tersimpan permanen. Detail baris gagal
            // ditampilkan di halaman import supaya bisa dicek dan diperbaiki.
            session([self::FAILED_KEY => $failedRows]);

            return redirect()
                ->route('admin.vehicle-customer-import.create')
                ->with('success', $message);
        }

        session()->forget(self::FAILED_KEY);

        return redirect()
            ->route('admin.vehicles.index')
            ->with('success', $message);
    }

    /** Batalkan preview, atau tutup daftar baris gagal. */
    public function cancel()
    {
        session()->forget([self::SESSION_KEY, self::FAILED_KEY]);

        return back();
    }

    /**
     * Peta [nilai => vehicle id] untuk kendaraan yang sudah ada di DB.
     * Di-chunk supaya tidak melewati batas jumlah bind parameter.
     */
    private function existingVehicleMap(string $column, array $values): array
    {
        $values = array_values(array_unique(array_filter($values, fn ($v) => $v !== '')));

        $map = [];
        foreach (array_chunk($values, 500) as $chunk) {
            foreach (Vehicle::whereIn($column, $chunk)->pluck('id', $column) as $key => $id) {
                $map[$key] = $id;
            }
        }

        return $map;
    }

    /** Pesan error ramah — jangan bocorkan SQL mentah ke UI (detail ada di log). */
    private function friendlyError(\Throwable $e): string
    {
        if ($e instanceof QueryException) {
            return 'Database rejected this row (possible duplicate or invalid value).';
        }

        return Str::limit($e->getMessage(), 200);
    }

    /**
     * Cari customer existing by nama (case-insensitive, trimmed) dulu sebelum
     * create baru — mencegah duplicate customer record untuk nama yang sama
     * (temuan profiling: 1.230 nama unik dari 1.295 baris valid).
     * Phone dari row dipakai HANYA saat create baru (existing tidak di-overwrite,
     * data existing dianggap lebih terpercaya daripada data import lama).
     */
    private function findOrCreateCustomer(string $name, string $phone): Customer
    {
        $existing = Customer::whereRaw('LOWER(TRIM(name)) = ?', [Str::lower(trim($name))])->first();

        if ($existing) {
            return $existing; // wasRecentlyCreated = false untuk model hasil query
        }

        return Customer::create([
            'name' => trim($name),
            'phone' => $phone,
        ]);
    }
}
