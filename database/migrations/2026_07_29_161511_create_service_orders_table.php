<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_advisor_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('technician_id')->nullable()->constrained('users')->nullOnDelete();

            // Nomor WO fisik dari bengkel, diinput manual oleh SA (bukan auto-generate lagi).
            // String bebas karena format bisa campuran angka/huruf/prefix.
            $table->string('work_order_number')->unique();

            $table->enum('status', [
                'appointment',
                'work_in_progress',
                'quality_control',
                'invoice_preparation',
                'completed',
                'all_rejected_cancelled',
            ])->default('appointment');

            $table->enum('items_approval_status', [
                'pending',
                'partially_approved',
                'approved',
                'rejected',
            ])->default('pending');

            $table->decimal('inspection_fee', 12, 2);
            $table->text('inspection_fee_note')->nullable();
            $table->text('personal_message')->nullable();

            $table->string('inspection_token')->unique()->nullable();
            $table->timestamp('inspection_token_expires_at')->nullable();

            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_orders');
    }
};