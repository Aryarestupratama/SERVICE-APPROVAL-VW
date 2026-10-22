<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            // TASK-053: alasan keterlambatan, dipilih SA lewat select (bukan input teks) saat order
            // berada di work_in_progress / quality_control. Disimpan sebagai string nullable (bukan
            // enum MySQL) supaya pilihan baru kelak tidak butuh ALTER enum di hosting; daftar nilai
            // yang sah dijaga ServiceOrder::DELAY_REASONS. NULL = tidak ada keterlambatan.
            $table->string('delay_reason', 30)->nullable()->after('items_approval_status');
        });
    }

    public function down(): void
    {
        Schema::table('service_orders', function (Blueprint $table) {
            $table->dropColumn('delay_reason');
        });
    }
};
