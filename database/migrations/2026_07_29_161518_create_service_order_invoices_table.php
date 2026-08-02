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
            $table->foreignId('service_order_id')->constrained()->cascadeOnDelete();
            $table->string('file_path');
            // sort_order menentukan urutan tampil ("Invoice 1", "Invoice 2", dst)
            // di halaman admin & publik — bukan urutan waktu upload.
            $table->unsignedInteger('sort_order')->default(0);
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