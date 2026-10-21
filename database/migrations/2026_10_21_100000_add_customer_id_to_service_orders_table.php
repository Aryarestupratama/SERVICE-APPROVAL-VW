<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            // TASK-010 / OQ-5: customer order disimpan saat order dibuat (primary kendaraan saat itu),
            // jadi mengganti primary kendaraan tidak lagi mengubah order lama. Nullable karena
            // kendaraan tanpa primary (vehicles.customer_id NULL) memang bisa ada. restrictOnDelete,
            // bukan nullOnDelete: customer yang masih dirujuk order tidak boleh hilang diam-diam
            // (RULE-039); guard di CustomerController::destroy memberi pesan yang ramah.
            $table->foreignId('customer_id')->nullable()->after('vehicle_id')
                ->constrained('customers')->restrictOnDelete();
        });

        // Backfill semua order (apa pun statusnya) dari primary kendaraan SAAT INI, sehingga
        // tampilan order lama tidak berubah saat deploy. Riwayat primary sebelumnya tidak
        // tersimpan, jadi order yang sudah terlanjur berubah tidak bisa dipulihkan.
        DB::statement(
            'UPDATE service_orders SET customer_id = ('
            . 'SELECT vehicles.customer_id FROM vehicles WHERE vehicles.id = service_orders.vehicle_id)'
        );
    }

    public function down(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('customer_id');
        });
    }
};
