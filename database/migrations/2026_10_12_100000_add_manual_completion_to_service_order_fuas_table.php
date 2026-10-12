<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_order_fuas', function (Blueprint $table) {
            // Admin menutup FUAS secara manual lewat tombol "Done" (FR-036): dipakai untuk order
            // completed lama yang follow-up-nya sudah dilakukan di luar sistem. Status "Done"
            // tetap DIHITUNG oleh FuasStatusService dari kolom ini (RULE-036), bukan disimpan.
            $table->timestamp('manually_completed_at')->nullable()->after('submitted_at');
            $table->foreignId('manually_completed_by')->nullable()->after('manually_completed_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('service_order_fuas', function (Blueprint $table) {
            $table->dropConstrainedForeignId('manually_completed_by');
            $table->dropColumn('manually_completed_at');
        });
    }
};
