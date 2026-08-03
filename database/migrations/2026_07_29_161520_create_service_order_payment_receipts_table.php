<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_payment_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_order_id')->constrained()->cascadeOnDelete();
            // 'customer' = upload bukti bayar oleh customer via link publik,
            // 'staff' = upload receipt versi SA via admin panel. Independen,
            // masing-masing max 1 baris per order (unique composite di bawah).
            $table->enum('uploader_type', ['customer', 'staff']);
            $table->string('file_path');
            $table->timestamp('uploaded_at');
            // Null kalau uploader_type = customer (tidak ada akun/login).
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['service_order_id', 'uploader_type'], 'sopr_order_uploader_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_order_payment_receipts');
    }
};