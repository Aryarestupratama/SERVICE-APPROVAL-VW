<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_invoices', function (Blueprint $table) {
            $table->id();
            // unique() -> revisi balik ke 1 WO : 1 invoice (PROJECT-RULES.md
            // bagian 2 & TODO bagian 7), sebelumnya multi-PDF pakai sort_order.
            $table->foreignId('service_order_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('file_path');
            $table->timestamp('uploaded_at');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_order_invoices');
    }
};