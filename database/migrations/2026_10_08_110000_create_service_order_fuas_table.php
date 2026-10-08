<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_fuas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_order_id')->unique()->constrained()->cascadeOnDelete();

            // BERBEDA dari service_orders.inspection_token (ADR-013, RULE-038).
            $table->string('feedback_token', 32)->unique();

            // Hanya 0..2; bertambah hanya lewat konfirmasi kirim (RULE-037).
            $table->unsignedTinyInteger('sent_count')->default(0);
            $table->timestamp('first_sent_at')->nullable();
            $table->timestamp('last_sent_at')->nullable();
            $table->foreignId('last_sent_by')->nullable()->constrained('users')->nullOnDelete();

            // Isi feedback customer (diisi lewat halaman publik, TASK-032/033).
            $table->timestamp('submitted_at')->nullable();
            $table->unsignedTinyInteger('satisfaction_score')->nullable();   // 1-10
            $table->unsignedTinyInteger('recommend_score')->nullable();      // 1-10
            $table->text('vehicle_issue_note')->nullable();                  // kendala setelah service (teks bebas)
            $table->text('suggestion')->nullable();                          // saran dan masukan
            $table->json('suggestion_categories')->nullable();               // subset kunci kategori

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_order_fuas');
    }
};
