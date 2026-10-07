<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\CustomerVehicle;
use App\Models\ServiceOrder;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Data DEMO untuk screenshot panduan / presentasi (semua data FIKTIF).
 *
 * Isi: 24 customer, 26 kendaraan VW/Audi, 42 service order tersebar 30 hari
 * terakhir di SEMUA status (termasuk order macet > 21 hari untuk "Needs
 * Attention"), lengkap dengan video, item inspeksi, keputusan customer,
 * invoice, bukti bayar, dan log keputusan.
 *
 * Cara pakai (JANGAN di database produksi):
 *   php artisan migrate:fresh --seed          # Settings + User
 *   php artisan db:seed --class=DemoDataSeeder
 *   php artisan storage:link                  # kalau belum, supaya PDF demo bisa dibuka
 *
 * Seeder ini TIDAK menyentuh ServiceOrderSeeder/CustomerSeeder/VehicleSeeder
 * lama (ID hardcode-nya sudah tidak cocok dengan UserSeeder sekarang).
 */
class DemoDataSeeder extends Seeder
{
    /**
     * GANTI dengan link video YouTube milik Anda (unlisted juga boleh) supaya
     * pemutar video di halaman publik tampil saat di-screenshot.
     * Format yang dikenali frontend: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID.
     */
    private const DEMO_VIDEO_URL = 'https://www.youtube.com/watch?v=GANTI_DENGAN_ID_VIDEO_ANDA';

    private const FIRST_WO_NUMBER = 1001;

    private Carbon $now;
    private float $ppn = 11.0;

    public function run(): void
    {
        if (app()->isProduction() && ! env('ALLOW_DEMO_SEED')) {
            $this->command?->error('DemoDataSeeder dihentikan: environment production. Jalankan di database lokal/staging.');

            return;
        }

        if (ServiceOrder::where('work_order_number', 'WSWO-' . self::FIRST_WO_NUMBER)->exists()) {
            $this->command?->warn('Data demo sudah ada (WSWO-' . self::FIRST_WO_NUMBER . '). Dilewati.');

            return;
        }

        $advisors = User::where('role', 'service_advisor')->get();
        $technicians = User::where('role', 'chief_technician')->get();

        if ($advisors->isEmpty()) {
            $this->command?->error('Belum ada user service_advisor. Jalankan dulu: php artisan db:seed (UserSeeder).');

            return;
        }

        mt_srand(20261007); // deterministik: hasil sama tiap dijalankan
        $this->now = Carbon::now();
        $this->ppn = (float) (Setting::current()->ppn_percent ?? 11);

        DB::transaction(function () use ($advisors, $technicians) {
            $customers = $this->seedCustomers();
            $vehicles = $this->seedVehicles($customers);
            $this->seedOrders($vehicles, $customers, $advisors->all(), $technicians->all());
        });
    }

    // ------------------------------------------------------------------
    // Customer & kendaraan
    // ------------------------------------------------------------------

    /** @return array<int, Customer> index 1..24 */
    private function seedCustomers(): array
    {
        $rows = [
            1 => ['Mr.', 'Budi Santoso', 'gmail.com'],
            2 => ['Mrs.', 'Linda Wijaya', 'gmail.com'],
            3 => ['Mr.', 'Michael Tanujaya', 'outlook.com'],
            4 => ['Mss.', 'Stephanie Halim', 'gmail.com'],
            5 => ['Mr.', 'Andreas Kurniawan', 'yahoo.co.id'],
            6 => ['Mrs.', 'Siti Rahmawati', 'gmail.com'],
            7 => ['Mr.', 'Rizky Pratama', 'gmail.com'],
            8 => ['Mrs.', 'Dewi Anggraini', 'gmail.com'],
            9 => ['Mr.', 'Hendra Lesmana', 'outlook.com'],
            10 => ['Mss.', 'Jessica Salim', 'gmail.com'],
            11 => ['Mr.', 'Agus Setiawan', 'yahoo.co.id'],
            12 => ['Mrs.', 'Maya Puspitasari', 'gmail.com'],
            13 => ['Mr.', 'Kevin Susanto', 'gmail.com'],
            14 => ['Mr.', 'Fajar Nugroho', 'gmail.com'],
            15 => ['Mrs.', 'Caroline Tan', 'outlook.com'],
            16 => ['Mr.', 'Dimas Aditya Putra', 'gmail.com'],
            17 => ['Mrs.', 'Ratna Sari Dewi', 'yahoo.co.id'],
            18 => ['Mr.', 'Benny Hartono', 'gmail.com'],
            19 => ['Mss.', 'Nadia Fitriani', 'gmail.com'],
            20 => ['Mr.', 'Ferry Gunadi', 'outlook.com'],
            21 => ['Mr.', 'Yusuf Hakim', 'gmail.com'],
            22 => ['Mrs.', 'Angelina Chandra', 'gmail.com'],
            23 => ['Mr.', 'Reynaldo Pangestu', 'gmail.com'],
            24 => ['Mr.', 'Ivan Kusumo', 'gmail.com'],
        ];

        $prefixes = ['0811', '0812', '0813', '0821', '0852', '0857', '0878', '0896'];
        $customers = [];

        foreach ($rows as $i => [$title, $name, $domain]) {
            $phone = $prefixes[mt_rand(0, count($prefixes) - 1)] . str_pad((string) mt_rand(0, 99999999), 8, '0', STR_PAD_LEFT);
            $email = Str::of($name)->lower()->replace(' ', '.')->toString() . '@' . $domain;

            // Lewat Eloquent supaya mutator phone() menormalisasi ke 62xxx (RULE-031).
            $customers[$i] = Customer::create([
                'title' => $title,
                'name' => $name,
                'phone' => $phone,
                'email' => $email,
            ]);
        }

        return $customers;
    }

    /**
     * @param array<int, Customer> $customers
     * @return array<int, array> index 1..26: ['id','brand','model','owner','label']
     */
    private function seedVehicles(array $customers): array
    {
        // [brand, model, ownerIdx, picIdx|null]
        $defs = [
            1 => ['VW', 'Tiguan Allspace 1.4 TSI', 1, null],
            2 => ['VW', 'Golf GTI', 3, null],
            3 => ['VW', 'Polo GTI', 4, null],
            4 => ['VW', 'T-Cross 1.0 TSI', 6, null],
            5 => ['VW', 'Touareg 3.0 V6 TSI', 9, null],
            6 => ['VW', 'Tiguan R-Line', 7, null],
            7 => ['VW', 'Golf 8 R-Line', 8, null],
            8 => ['VW', 'Caddy Maxi', 21, null],
            9 => ['VW', 'Multivan T6.1', 18, 19],
            10 => ['VW', 'Jetta 1.4 TSI', 14, null],
            11 => ['VW', 'Polo 1.2 TSI', 10, null],
            12 => ['VW', 'Scirocco 1.4 TSI', 13, null],
            13 => ['VW', 'Beetle 1.2 TSI', 15, null],
            14 => ['VW', 'Tiguan 1.4 TSI', 16, null],
            15 => ['VW', 'Golf 1.4 TSI', 9, null],
            16 => ['VW', 'T-Cross 1.0 TSI', 2, null],
            17 => ['VW', 'Tiguan Allspace 1.4 TSI', 5, null],
            18 => ['Audi', 'Q3 35 TFSI', 11, null],
            19 => ['Audi', 'Q5 2.0 TFSI quattro', 12, null],
            20 => ['Audi', 'A4 2.0 TFSI', 17, null],
            21 => ['Audi', 'A3 Sportback 1.4 TFSI', 20, null],
            22 => ['Audi', 'Q7 3.0 TFSI quattro', 22, 19],
            23 => ['Audi', 'A6 2.0 TFSI', 23, null],
            24 => ['Audi', 'Q8 55 TFSI quattro', 24, null],
            25 => ['Audi', 'Q2 35 TFSI', 4, null],
            26 => ['Audi', 'e-tron 55 quattro', 18, null],
        ];

        $letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
        $modelCodes = ['5N', 'AU', 'AW', 'C1', '7P', '2K', '7H', '16', '13', '5C'];
        $yearChars = ['K', 'L', 'M', 'N', 'P'];
        $created = $this->now->copy()->subDays(45); // kendaraan sudah terdaftar sebelum periode demo
        $vehicles = [];

        foreach ($defs as $i => [$brand, $model, $ownerIdx, $picIdx]) {
            $plate = 'B' . mt_rand(1000, 9999)
                . $letters[mt_rand(0, strlen($letters) - 1)]
                . $letters[mt_rand(0, strlen($letters) - 1)]
                . $letters[mt_rand(0, strlen($letters) - 1)]; // RULE-032: huruf besar, tanpa spasi

            $vin = ($brand === 'Audi' ? 'WAUZZZ' : 'WVWZZZ')
                . $modelCodes[$i % count($modelCodes)]
                . $yearChars[$i % count($yearChars)] . 'P' . (($i % 9) + 1)
                . (100000 + $i * 37); // total tepat 17 karakter
            if (strlen($vin) !== 17) {
                throw new \RuntimeException("VIN demo bukan 17 karakter: {$vin}");
            }

            $vehicleId = DB::table('vehicles')->insertGetId([
                'customer_id' => null, // diisi CustomerVehicleObserver saat pivot primary dibuat
                'plate_number' => $plate,
                'brand' => $brand,
                'vin' => $vin,
                'model' => $model,
                'created_at' => $created,
                'updated_at' => $created,
            ]);

            // Lewat model pivot supaya CustomerVehicleObserver menjaga invarian primary.
            CustomerVehicle::create([
                'customer_id' => $customers[$ownerIdx]->id,
                'vehicle_id' => $vehicleId,
                'is_primary' => true,
            ]);

            if ($picIdx !== null) {
                CustomerVehicle::create([
                    'customer_id' => $customers[$picIdx]->id,
                    'vehicle_id' => $vehicleId,
                    'is_primary' => false,
                ]);
            }

            $vehicles[$i] = [
                'id' => $vehicleId,
                'brand' => $brand,
                'model' => $model,
                'owner' => $customers[$ownerIdx],
                'label' => "{$brand} {$model}",
            ];
        }

        return $vehicles;
    }

    // ------------------------------------------------------------------
    // Service order
    // ------------------------------------------------------------------

    private function seedOrders(array $vehicles, array $customers, array $advisors, array $technicians): void
    {
        // Rencana distribusi status. Angka = "berapa hari lalu status itu dicapai".
        $plan = [
            'completed' => [0, 0, 1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, 17, 18, 20, 21, 22],
            'invoice_preparation' => [1, 3, 5, 24],        // 24 = macet > 21 hari
            'quality_control' => [0, 2, 4],
            'work_in_progress' => [0, 1, 2, 3, 5, 23, 26], // 23 & 26 = macet > 21 hari
            'appointment' => [0, 0, 1],
            'all_rejected_cancelled' => [9, 17],
        ];

        // 1) Bangun timeline tiap order.
        $orders = [];
        foreach ($plan as $status => $days) {
            foreach ($days as $d) {
                $orders[] = $this->buildTimeline($status, $d);
            }
        }

        // 2) Urutkan berdasarkan waktu dibuat; beri nomor WO berurutan.
        usort($orders, fn ($a, $b) => $a['t']['created']->timestamp <=> $b['t']['created']->timestamp);

        // 3) Pilih kendaraan tanpa bentrok waktu (satu mobil tidak punya 2 order aktif bersamaan).
        $usage = array_fill_keys(array_keys($vehicles), []); // vehicleKey => [[start,end], ...]
        $order = array_keys($vehicles);
        $this->shuffle($order);

        foreach ($orders as $idx => &$o) {
            $start = $o['t']['created'];
            $end = $o['t']['end'];
            $best = null;
            $bestCount = PHP_INT_MAX;

            foreach ($order as $key) {
                $overlap = false;
                foreach ($usage[$key] as [$s, $e]) {
                    if ($start->lessThan($e) && $s->lessThan($end)) {
                        $overlap = true;
                        break;
                    }
                }
                if (! $overlap && count($usage[$key]) < $bestCount) {
                    $best = $key;
                    $bestCount = count($usage[$key]);
                }
            }
            $best ??= array_key_first($vehicles);
            $usage[$best][] = [$start, $end];
            $o['vehicle_key'] = $best;
        }
        unset($o);

        // 4) Tulis ke database.
        $invoiceSeq = 0;
        $scenarioOrder = range(0, count($this->scenarios()) - 1);
        $this->shuffle($scenarioOrder);

        foreach ($orders as $n => $o) {
            $woNumber = 'WSWO-' . (self::FIRST_WO_NUMBER + $n);
            $vehicle = $vehicles[$o['vehicle_key']];
            $customer = $vehicle['owner'];
            $advisor = $advisors[mt_rand(0, count($advisors) - 1)];
            $technician = $technicians ? $technicians[mt_rand(0, count($technicians) - 1)] : null;
            $scenario = $this->scenarios()[$scenarioOrder[$n % count($scenarioOrder)]];

            $this->writeOrder($woNumber, $o, $vehicle, $customer, $advisor, $technician, $scenario, $invoiceSeq);
        }

        $this->command?->info(count($orders) . ' service order demo dibuat (WSWO-' . self::FIRST_WO_NUMBER . ' s.d. WSWO-' . (self::FIRST_WO_NUMBER + count($orders) - 1) . ').');
    }

    /** Hitung selisih hari tiap tahap lalu ubah menjadi timestamp berurutan. */
    private function buildTimeline(string $status, int $d): array
    {
        $g = fn (array $opts) => $opts[mt_rand(0, count($opts) - 1)];
        $day = ['comp' => null, 'inv' => null, 'qc' => null, 'dec' => null, 'wip' => null, 'c' => null];

        switch ($status) {
            case 'appointment':
                $day['c'] = $d;
                break;
            case 'work_in_progress':
                $day['wip'] = $d;
                $day['c'] = $d + $g([0, 0, 1]);
                break;
            case 'quality_control':
                $day['qc'] = $d;
                $day['dec'] = $d + $g([0, 1]);
                $day['wip'] = $day['dec'] + $g([1, 2]);
                $day['c'] = $day['wip'] + $g([0, 1]);
                break;
            case 'invoice_preparation':
                $day['inv'] = $d;
                $day['qc'] = $d + 1;
                $day['dec'] = $day['qc'] + $g([0, 1]);
                $day['wip'] = $day['dec'] + $g([1, 2]);
                $day['c'] = $day['wip'] + $g([0, 1]);
                break;
            case 'completed':
                $day['comp'] = $d;
                $day['inv'] = $d + $g([1, 2]);
                $day['qc'] = $day['inv'] + 1;
                $day['dec'] = $day['qc'] + $g([0, 1]);
                $day['wip'] = $day['dec'] + $g([1, 2]);
                $day['c'] = $day['wip'] + $g([0, 1]);
                break;
            case 'all_rejected_cancelled':
                $day['dec'] = $d;
                $day['wip'] = $d + $g([1, 2]);
                $day['c'] = $day['wip'] + $g([0, 1]);
                break;
        }

        if ($day['c'] > 29) {
            throw new \RuntimeException("Timeline {$status} melewati 30 hari ({$day['c']}).");
        }

        $t = ['created' => $this->ts($day['c'])];
        $last = $t['created'];
        foreach (['wip', 'dec', 'qc', 'inv', 'comp'] as $step) {
            if ($day[$step] !== null) {
                $t[$step] = $last = $this->ts($day[$step], $last);
            }
        }

        $t['last'] = $last;
        $t['end'] = in_array($status, ['completed', 'all_rejected_cancelled'], true) ? $last : $this->now->copy();

        return ['status' => $status, 't' => $t];
    }

    private function writeOrder(
        string $wo,
        array $o,
        array $vehicle,
        Customer $customer,
        User $advisor,
        ?User $technician,
        array $scenario,
        int &$invoiceSeq,
    ): void {
        $status = $o['status'];
        $t = $o['t'];
        $isAudi = $vehicle['brand'] === 'Audi';

        // ---- item inspeksi + keputusan customer ----
        $items = $this->buildItems($scenario, $isAudi);
        $decided = in_array($status, ['quality_control', 'invoice_preparation', 'completed', 'all_rejected_cancelled'], true);

        if ($decided) {
            $this->decideItems($items, $status === 'all_rejected_cancelled');
        }

        $approvalStatus = 'pending';
        if ($decided) {
            $approvalStatus = ServiceOrder::computeApprovalStatus(collect($items)->map(fn ($i) => (object) ['status' => $i['status']]));
        }

        // ---- inspection fee ----
        $feeOptions = [0, 150000, 150000, 250000, 250000, 350000];
        $fee = $feeOptions[mt_rand(0, count($feeOptions) - 1)];

        $hasToken = true;
        $expires = $t['created']->copy()->addDays(30);
        if ($status === 'work_in_progress' && $t['wip']->lessThan($this->now->copy()->subDays(25))) {
            // Order macet paling lama: link sudah kedaluwarsa -> bagus untuk screenshot halaman Link Expired.
            $expires = $this->now->copy()->subDays(2);
        }

        $greeting = match (true) {
            $t['created']->hour < 11 => 'Selamat pagi',
            $t['created']->hour < 15 => 'Selamat siang',
            default => 'Selamat sore',
        };
        $honorific = $customer->title === 'Mr.' ? 'Bapak' : 'Ibu';
        $firstName = explode(' ', $customer->name)[0];

        $billTo = $vehicle['label'] === 'VW Caddy Maxi' ? 'PT Sinar Mitra Logistik' : $customer->name;

        $orderId = DB::table('service_orders')->insertGetId([
            'vehicle_id' => $vehicle['id'],
            'service_advisor_id' => $advisor->id,
            'technician_id' => $technician?->id,
            'work_order_number' => $wo,
            'status' => $status,
            'status_changed_at' => $this->statusChangedAt($status, $t),
            'last_activity_at' => $t['last'],
            'items_approval_status' => $approvalStatus,
            'inspection_fee' => $fee,
            'inspection_fee_note' => $fee > 0 ? 'Comprehensive multi-point inspection' : 'Complimentary inspection',
            'personal_message' => "{$greeting} {$honorific} {$firstName}, berikut hasil pengecekan kendaraan Anda. "
                . 'Silakan tonton video dari teknisi kami, lalu pilih item yang ingin dikerjakan. Terima kasih.',
            'customer_complaint' => $scenario['complaint'],
            'inspection_token' => $hasToken ? Str::random(32) : null,
            'inspection_token_expires_at' => $expires,
            'finalized_at' => $decided ? $t['dec'] : null,
            'invoice_number' => null,
            'bill_to' => null,
            'created_at' => $t['created'],
            'updated_at' => $t['last'],
        ]);

        // ---- video (1 per order, sesuai aturan sistem) ----
        DB::table('service_order_videos')->insert([
            'service_order_id' => $orderId,
            'video_url' => self::DEMO_VIDEO_URL,
            'video_source' => 'external_link',
            'sort_order' => 0,
            'duration_seconds' => null,
            'created_at' => $t['created'],
            'updated_at' => $t['created'],
        ]);

        // ---- item + log keputusan ----
        foreach ($items as $item) {
            $itemId = DB::table('inspection_items')->insertGetId([
                'service_order_id' => $orderId,
                'name' => $item['name'],
                'description' => $item['description'],
                'cost_item' => $item['cost_item'],
                'cost_labour' => $item['cost_labour'],
                'discount_item_percent' => $item['disc_item'],
                'discount_labour_percent' => $item['disc_labour'],
                'final_price_snapshot' => $item['snapshot'] ?? null,
                'group' => $item['group'],
                'status' => $item['status'] ?? 'pending',
                'decided_at' => $decided ? $t['dec'] : null,
                'created_at' => $t['created'],
                'updated_at' => $decided ? $t['dec'] : $t['created'],
            ]);

            if ($decided) {
                $this->writeDecisionLogs($itemId, $item['status'], $t['dec']);
            }
        }

        // ---- estimation form per kelompok (opsional, ~55% order yang sudah berjalan) ----
        if (isset($t['wip']) && mt_rand(1, 100) <= 55) {
            foreach (array_values(array_unique(array_column($items, 'group'))) as $group) {
                $path = "estimation-documents/demo-{$wo}-{$group}.pdf";
                Storage::disk('public')->put($path, $this->pdf("Estimation Form - {$wo}", ucfirst($group) . ' group (demo data)'));
                $up = $t['wip']->copy()->addMinutes(mt_rand(20, 120));
                DB::table('service_order_estimation_documents')->insert([
                    'service_order_id' => $orderId,
                    'group' => $group,
                    'pdf_path' => $path,
                    'uploaded_at' => $up->greaterThan($this->now) ? $this->now : $up,
                    'uploaded_by' => $advisor->id,
                    'created_at' => $t['wip'],
                    'updated_at' => $t['wip'],
                ]);
            }
        }

        // ---- invoice & bukti bayar ----
        if (in_array($status, ['invoice_preparation', 'completed'], true)) {
            $invoiceSeq++;
            $path = "invoices/demo-{$wo}.pdf";
            Storage::disk('public')->put($path, $this->pdf("Invoice - {$wo}", "{$vehicle['label']} / {$customer->name} (demo data)"));

            DB::table('service_order_invoices')->insert([
                'service_order_id' => $orderId,
                'file_path' => $path,
                'uploaded_at' => $t['inv'],
                'uploaded_by' => $advisor->id,
                'created_at' => $t['inv'],
                'updated_at' => $t['inv'],
            ]);

            DB::table('service_orders')->where('id', $orderId)->update([
                'invoice_number' => 'INV/VWPIK/' . $t['inv']->format('ym') . '/' . str_pad((string) $invoiceSeq, 4, '0', STR_PAD_LEFT),
                'bill_to' => $billTo,
            ]);

            $receipts = $this->receiptPlan($status, $t);
            if ($receipts['customer'] !== null) {
                $this->writeReceipt($orderId, $wo, 'customer', $receipts['customer'], null);
            }
            if ($receipts['staff'] !== null) {
                $this->writeReceipt($orderId, $wo, 'staff', $receipts['staff'], $advisor->id);
            }
        }
    }

    /** Kapan status terakhir berubah (dipakai Dashboard untuk "lama di status"). */
    private function statusChangedAt(string $status, array $t): Carbon
    {
        return match ($status) {
            'appointment' => $t['created'],
            'work_in_progress' => $t['wip'],
            'quality_control' => $t['qc'],
            'invoice_preparation' => $t['inv'],
            'completed' => $t['comp'],
            'all_rejected_cancelled' => $t['dec'],
        };
    }

    /** Siapa yang sudah mengunggah bukti bayar, dan kapan. */
    private function receiptPlan(string $status, array $t): array
    {
        $plan = ['customer' => null, 'staff' => null];

        if ($status === 'completed') {
            if (mt_rand(1, 100) <= 85) {
                $plan['customer'] = $this->between($t['inv'], $t['comp']);
            }
            if (mt_rand(1, 100) <= 55) {
                $plan['staff'] = $this->between($plan['customer'] ?? $t['inv'], $t['comp']);
            }

            return $plan;
        }

        // invoice_preparation: order macet (>21 hari) belum ada pembayaran.
        if ($t['inv']->lessThan($this->now->copy()->subDays(21))) {
            return $plan;
        }

        static $counter = 0;
        $counter++;
        $until = $this->now->copy();
        if ($counter === 1) {
            $plan['customer'] = $this->between($t['inv'], $until);
        } elseif ($counter === 2) {
            $plan['customer'] = $this->between($t['inv'], $until);
            $plan['staff'] = $this->between($plan['customer'], $until);
        }

        return $plan;
    }

    private function writeReceipt(int $orderId, string $wo, string $type, Carbon $at, ?int $userId): void
    {
        $path = "payment-receipts/demo-{$wo}-{$type}.pdf";
        Storage::disk('public')->put($path, $this->pdf("Payment Receipt - {$wo}", "Uploaded by {$type} (demo data)"));

        DB::table('service_order_payment_receipts')->insert([
            'service_order_id' => $orderId,
            'uploader_type' => $type,
            'file_path' => $path,
            'uploaded_at' => $at,
            'uploaded_by' => $userId,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }

    private function writeDecisionLogs(int $itemId, string $finalStatus, Carbon $at): void
    {
        $ips = ['114.122.78.31', '36.71.22.104', '180.244.160.57', '103.78.114.9', '112.215.200.42'];
        $agents = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
        ];
        $ip = $ips[mt_rand(0, count($ips) - 1)];
        $ua = $agents[mt_rand(0, count($agents) - 1)];

        $rows = [];
        // ~12% item: customer sempat memilih Reject lalu mengubah ke Approve (demo fitur ubah keputusan).
        if ($finalStatus === 'approved' && mt_rand(1, 100) <= 12) {
            $first = $at->copy()->subMinutes(mt_rand(2, 9));
            $rows[] = ['pending', 'rejected', $first];
            $rows[] = ['rejected', 'approved', $at];
        } else {
            $rows[] = ['pending', $finalStatus, $at];
        }

        foreach ($rows as [$old, $new, $when]) {
            DB::table('inspection_item_logs')->insert([
                'inspection_item_id' => $itemId,
                'old_status' => $old,
                'new_status' => $new,
                'actor_type' => 'customer',
                'actor_id' => null,
                'ip_address' => $ip,
                'user_agent' => $ua,
                'created_at' => $when,
                'updated_at' => $when,
            ]);
        }
    }

    // ------------------------------------------------------------------
    // Item inspeksi
    // ------------------------------------------------------------------

    /** Katalog item: slug => [nama, deskripsi, group, harga part, harga labour] (Rupiah, tarif VW). */
    private function catalog(): array
    {
        return [
            'oil' => ['Engine oil & oil filter replacement', 'VW 504 00 / 507 00 spec 5W-30 synthetic oil with genuine oil filter', 'related', 1150000, 250000],
            'dsg' => ['DSG gearbox oil & filter replacement', 'Genuine DSG fluid and filter, includes adaptation reset', 'related', 2450000, 850000],
            'spark' => ['Spark plugs replacement (set of 4)', 'Worn electrodes found, risk of misfire under load', 'related', 1100000, 450000],
            'coil' => ['Ignition coil replacement (1 pc)', 'Weak coil detected on cylinder 3 during diagnostic scan', 'related', 1350000, 300000],
            'throttle' => ['Throttle body cleaning & adaptation', 'Carbon build-up causing unstable idle', 'related', 150000, 450000],
            'gasket' => ['Valve cover gasket replacement', 'Light oil seepage found around the valve cover', 'related', 1650000, 950000],
            'pump' => ['Water pump & thermostat replacement', 'Coolant weeping from the pump, replaced together with the thermostat', 'durability', 2850000, 1200000],
            'pad' => ['Front brake pads replacement', 'Pad thickness below 3 mm, replace before the wear limit', 'safety', 1850000, 450000],
            'disc' => ['Front brake discs replacement', 'Discs below minimum thickness, replaced as a pair', 'safety', 3400000, 650000],
            'bfluid' => ['Brake fluid replacement', 'Moisture content above the recommended limit', 'safety', 350000, 250000],
            'wiper' => ['Front wiper blades replacement (pair)', 'Streaking and chatter noise detected', 'safety', 480000, 100000],
            'tyres' => ['Front tyres replacement (pair)', 'Uneven wear on inner shoulder, tread depth near the limit', 'safety', 4600000, 400000],
            'align' => ['Wheel alignment & balancing (4 wheels)', 'Steering pulls slightly to the right, balancing weights included', 'durability', 120000, 650000],
            'shock' => ['Front shock absorbers replacement (pair)', 'Leaking damper seals and knocking noise over bumps', 'durability', 5400000, 1400000],
            'bush' => ['Front control arm bushings replacement', 'Cracked rubber causing play in the front axle', 'durability', 2200000, 1100000],
            'mount' => ['Engine mount replacement', 'Excessive vibration at idle caused by a worn mount', 'durability', 1950000, 850000],
            'coolant' => ['Coolant replacement & system flush', 'Coolant is overdue for replacement (G13 spec)', 'durability', 650000, 350000],
            'belt' => ['Drive belt & tensioner replacement', 'Cracks visible on the belt ribs', 'durability', 1350000, 500000],
            'cabin' => ['Cabin air filter replacement', 'Clogged filter reduces airflow and A/C performance', 'experience', 380000, 100000],
            'ac' => ['A/C system service & recharge', 'Refrigerant level low, includes leak test and compressor oil', 'experience', 650000, 550000],
            'software' => ['Gearbox software update & adaptation', 'Latest calibration to smooth low-speed shifting', 'experience', 250000, 750000],
            'headlight' => ['Headlight restoration & coating', 'Yellowed and hazy lenses reduce night visibility', 'appearance', 300000, 650000],
            'interior' => ['Interior deep cleaning & sanitising', 'Full cabin steam clean, seats and carpet treatment', 'appearance', 250000, 850000],
            'coating' => ['Paint correction & ceramic coating', 'Two-stage polish followed by 9H ceramic coating', 'appearance', 3800000, 2500000],
            'glass' => ['Windscreen water-repellent coating', 'Improves wet-weather visibility', 'appearance', 350000, 250000],
        ];
    }

    /** Keluhan customer + item inti + item tambahan yang masuk akal. */
    private function scenarios(): array
    {
        return [
            ['complaint' => 'Servis berkala 20.000 km.', 'core' => ['oil', 'cabin', 'bfluid'], 'extras' => ['wiper', 'align', 'interior']],
            ['complaint' => 'Rem terasa kurang pakem dan berdecit saat diinjak.', 'core' => ['pad', 'bfluid'], 'extras' => ['disc', 'wiper', 'align']],
            ['complaint' => 'AC kurang dingin, terutama saat terjebak macet.', 'core' => ['ac', 'cabin'], 'extras' => ['coolant', 'belt', 'interior']],
            ['complaint' => 'Ada bunyi gluduk dari kaki-kaki depan saat melewati jalan berlubang.', 'core' => ['shock', 'bush'], 'extras' => ['align', 'tyres', 'mount']],
            ['complaint' => 'Perpindahan gigi terasa menyentak di putaran rendah.', 'core' => ['dsg', 'software'], 'extras' => ['oil', 'mount']],
            ['complaint' => 'Lampu check engine menyala dan mesin terasa pincang.', 'core' => ['spark', 'coil', 'throttle'], 'extras' => ['oil', 'cabin']],
            ['complaint' => 'Setir bergetar di kecepatan di atas 80 km/jam.', 'core' => ['align', 'tyres'], 'extras' => ['shock', 'bush', 'wiper']],
            ['complaint' => 'Servis berkala 40.000 km dan cek menyeluruh sebelum perjalanan jauh.', 'core' => ['oil', 'dsg', 'bfluid', 'spark'], 'extras' => ['coolant', 'cabin', 'pad']],
            ['complaint' => 'Ada rembesan oli di bagian bawah mesin.', 'core' => ['gasket', 'oil'], 'extras' => ['mount', 'belt', 'spark']],
            ['complaint' => 'Ingin tampilan mobil kembali seperti baru.', 'core' => ['headlight', 'interior'], 'extras' => ['coating', 'glass', 'wiper']],
            ['complaint' => 'Suhu mesin naik saat macet dan ada bau coolant.', 'core' => ['pump', 'coolant'], 'extras' => ['belt', 'oil', 'ac']],
        ];
    }

    private function buildItems(array $scenario, bool $isAudi): array
    {
        $catalog = $this->catalog();
        $slugs = $scenario['core'];

        $extras = $scenario['extras'];
        $this->shuffle($extras);
        foreach (array_slice($extras, 0, mt_rand(0, 2)) as $slug) {
            $slugs[] = $slug;
        }

        $mult = $isAudi ? 1.35 : 1.0;
        $items = [];
        foreach ($slugs as $slug) {
            [$name, $desc, $group, $part, $labour] = $catalog[$slug];

            $discItem = 0;
            $discLabour = 0;
            if (mt_rand(1, 100) <= 22) {
                $discItem = [5, 10, 15][mt_rand(0, 2)];
                $discLabour = mt_rand(0, 1) ? $discItem : 0;
            }

            $items[] = [
                'name' => $name,
                'description' => $desc,
                'group' => $group,
                'cost_item' => (int) (round($part * $mult / 5000) * 5000),
                'cost_labour' => (int) (round($labour * $mult / 5000) * 5000),
                'disc_item' => $discItem,
                'disc_labour' => $discLabour,
            ];
        }

        return $items;
    }

    /** Tentukan approve/reject per item dan kunci harga final (snapshot, sudah termasuk PPN). */
    private function decideItems(array &$items, bool $rejectAll): void
    {
        foreach ($items as &$item) {
            $expensive = ($item['cost_item'] + $item['cost_labour']) > 3500000;
            $approve = ! $rejectAll && mt_rand(1, 100) <= ($expensive ? 45 : 75);
            $item['status'] = $approve ? 'approved' : 'rejected';
        }
        unset($item);

        // Order yang lanjut ke tahap berikutnya wajib punya minimal 1 item approved.
        if (! $rejectAll && ! in_array('approved', array_column($items, 'status'), true)) {
            $items[0]['status'] = 'approved';
        }

        foreach ($items as &$item) {
            if ($item['status'] === 'approved') {
                $sub = $item['cost_item'] * (1 - $item['disc_item'] / 100)
                    + $item['cost_labour'] * (1 - $item['disc_labour'] / 100);
                $item['snapshot'] = (int) round($sub * (1 + $this->ppn / 100)); // sama dengan InspectionItemPricingService
            }
        }
        unset($item);
    }

    // ------------------------------------------------------------------
    // Util
    // ------------------------------------------------------------------

    /** Waktu acak jam kerja pada $daysAgo hari lalu; tidak pernah di masa depan dan selalu >= $after. */
    private function ts(int $daysAgo, ?Carbon $after = null): Carbon
    {
        $t = $this->now->copy()->startOfDay()->subDays($daysAgo)
            ->setTime(mt_rand(8, 17), mt_rand(0, 59), mt_rand(0, 59));

        if ($after && $t->lessThan($after)) {
            $t = $after->copy()->addMinutes(mt_rand(15, 90));
        }
        if ($t->greaterThan($this->now)) {
            $t = $this->now->copy()->subMinutes(mt_rand(1, 20));
        }
        if ($after && $t->lessThan($after)) {
            $t = $after->copy();
        }

        return $t;
    }

    private function between(Carbon $a, Carbon $b): Carbon
    {
        $secs = max(0, (int) $a->diffInSeconds($b, false));

        return $a->copy()->addSeconds((int) ($secs * mt_rand(20, 80) / 100));
    }

    /** Fisher-Yates dengan mt_rand supaya hasil deterministik setelah mt_srand(). */
    private function shuffle(array &$arr): void
    {
        for ($i = count($arr) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
        }
    }

    /** PDF satu halaman minimal (valid) supaya tombol download/preview di panel & halaman publik bisa dibuka. */
    private function pdf(string $title, string $subtitle): string
    {
        $esc = fn (string $s) => str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $s);
        $stream = "BT /F1 22 Tf 60 760 Td ({$esc($title)}) Tj ET\nBT /F1 12 Tf 60 730 Td ({$esc($subtitle)}) Tj ET";

        $objs = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3 => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            4 => '<< /Length ' . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
            5 => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $n => $body) {
            $offsets[$n] = strlen($pdf);
            $pdf .= "{$n} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 6\n0000000000 65535 f \n";
        foreach ($offsets as $off) {
            $pdf .= sprintf("%010d 00000 n \n", $off);
        }

        return $pdf . "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    }
}
