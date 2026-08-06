<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerVehicle;
use App\Models\Vehicle;
use App\Services\ExcelReader;
use App\Services\VehicleCustomerImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;

class CustomerVehicleImportController extends Controller
{
    private const SESSION_KEY = 'vehicle_customer_import_rows';

    public function __construct(
        private ExcelReader $reader,
        private VehicleCustomerImportService $importService,
    ) {}

    public function create()
    {
        return Inertia::render('Admin/Imports/VehicleCustomerImport', [
            'rows' => session(self::SESSION_KEY),
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
            'file' => ['required', 'file', 'mimes:xlsx,xls'],
        ]);

        $rawRows = $this->reader->readFirstSheet($request->file('file'));
        $parsedRows = $this->importService->parseRows($rawRows);

        // Cross-check ke DB: vin/plate yang sudah ada di database ditandai
        // 'existing' — bukan error, tapi row perlu tahu ini akan UPDATE bukan CREATE.
        $existingVins = Vehicle::whereIn('vin', array_column($parsedRows, 'vin'))
            ->pluck('id', 'vin');
        $existingPlates = Vehicle::whereIn('plate_number', array_column($parsedRows, 'plate_number'))
            ->pluck('id', 'plate_number');

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

        $excluded = array_flip($validated['excluded_row_ids'] ?? []);
        $rowsToImport = array_filter($rows, fn ($row) => ! isset($excluded[$row['row_id']]));

        $summary = ['created_vehicles' => 0, 'updated_vehicles' => 0, 'created_customers' => 0, 'skipped' => 0];
        $failedRows = [];

        // Per-baris transaction terpisah — SENGAJA bukan 1 transaction untuk
        // seluruh batch. Kalau 1 baris gagal (mis. constraint DB), baris lain
        // yang valid tetap harus jalan, bukan ikut ke-rollback semua.
        foreach ($rowsToImport as $row) {
            try {
                DB::transaction(function () use ($row, &$summary) {
                    if (! in_array($row['brand'], Vehicle::BRANDS) || $row['vin'] === '' || $row['plate_number'] === '') {
                        $summary['skipped']++;
                        return;
                    }

                    $primaryCustomer = $this->findOrCreateCustomer($row['primary_name'], $row['phone']);
                    $summary['created_customers'] += $primaryCustomer->wasRecentlyCreated ? 1 : 0;

                    $picCustomer = null;
                    if ($row['contact_name']) {
                        $picCustomer = $this->findOrCreateCustomer($row['contact_name'], $row['phone']);
                        $summary['created_customers'] += $picCustomer->wasRecentlyCreated ? 1 : 0;
                    }

                    $vehicle = Vehicle::where('vin', $row['vin'])
                        ->orWhere('plate_number', $row['plate_number'])
                        ->first();

                    $attributes = [
                        'plate_number' => $row['plate_number'],
                        'brand' => $row['brand'],
                        'vin' => $row['vin'],
                        'model' => $row['model'],
                    ];

                    if ($vehicle) {
                        $vehicle->update($attributes);
                        $summary['updated_vehicles']++;
                    } else {
                        $vehicle = Vehicle::create($attributes);
                        $summary['created_vehicles']++;
                    }

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
                });
            } catch (\Throwable $e) {
                $failedRows[] = [
                    'excel_row' => $row['excel_row'],
                    'plate_number' => $row['plate_number'],
                    'error' => $e->getMessage(),
                ];
            }
        }

        session()->forget(self::SESSION_KEY);

        if (! empty($failedRows)) {
            // Simpan detail error ke session terpisah supaya bisa ditampilkan
            // di halaman hasil import — TIDAK menggagalkan redirect, baris yang
            // sukses tetap tersimpan permanen.
            session(['vehicle_customer_import_failed_rows' => $failedRows]);
        }

        return redirect()
            ->route('admin.vehicles.index')
            ->with('success', sprintf(
                'Import complete: %d vehicles created, %d updated, %d customers created, %d rows skipped, %d rows failed.',
                $summary['created_vehicles'],
                $summary['updated_vehicles'],
                $summary['created_customers'],
                $summary['skipped'],
                count($failedRows),
            ));
    }

    public function cancel()
    {
        session()->forget(self::SESSION_KEY);
        return back();
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
            $existing->wasRecentlyCreated = false;
            return $existing;
        }

        return Customer::create([
            'name' => trim($name),
            'phone' => $phone,
        ]);
    }
}