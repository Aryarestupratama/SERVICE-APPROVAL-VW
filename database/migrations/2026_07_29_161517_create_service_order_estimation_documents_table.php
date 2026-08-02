<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * 1 PDF "estimation form" per kelompok item (group), diupload SA saat
     * work_in_progress, sifatnya editable (replace/hapus) selama negosiasi
     * berlangsung. PROJECT-RULES.md bagian 2.
     */
    public function up(): void
    {
        Schema::create('service_order_estimation_documents', function (Blueprint $table) {
            $table->id();

            $table->foreignId('service_order_id')
                ->constrained('service_orders')
                ->cascadeOnDelete();

            // Sama seperti inspection_items.group — related, safety, durability,
            // experience, appearance. Ditulis manual (bukan foreign key) karena
            // ini konstanta enum di kode (InspectionItem::GROUPS), bukan tabel
            // referensi terpisah.
            $table->enum('group', [
                'related',
                'safety',
                'durability',
                'experience',
                'appearance',
            ]);

            // Nullable: null berarti kelompok ini belum ada estimation form
            // terupload sama sekali.
            $table->string('pdf_path')->nullable();

            $table->timestamp('uploaded_at')->nullable();

            $table->foreignId('uploaded_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            // Maksimal 1 baris per kelompok per order — PROJECT-RULES.md bagian 2.
            $table->unique(['service_order_id', 'group']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_order_estimation_documents');
    }
};