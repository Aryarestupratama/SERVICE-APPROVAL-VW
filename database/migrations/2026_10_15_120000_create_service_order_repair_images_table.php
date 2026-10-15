<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Foto "setelah diperbaiki" per Service Order (maks 5, dijaga di
     * controller + lock baris order). Tiap foto punya deskripsi singkat.
     * Dipakai SA untuk menunjukkan bahwa kerusakan yang tampil di video
     * inspeksi sudah dikerjakan. File fisik di disk `public`
     * (folder repair-images), kolom hanya menyimpan path.
     */
    public function up(): void
    {
        Schema::create('service_order_repair_images', function (Blueprint $table) {
            $table->id();

            $table->foreignId('service_order_id')
                ->constrained('service_orders')
                ->cascadeOnDelete();

            $table->string('image_path');
            $table->string('description');
            $table->unsignedTinyInteger('sort_order')->default(0);

            $table->foreignId('uploaded_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->index(['service_order_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_order_repair_images');
    }
};
