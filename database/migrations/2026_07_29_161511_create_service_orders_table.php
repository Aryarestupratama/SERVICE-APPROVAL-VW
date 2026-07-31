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

            $table->unsignedBigInteger('work_order_number')->unique();

            $table->enum('status', [
                'scheduled',
                'in_progress',
                'quality_control',
                'follow_up',
                'completed',
                'all_rejected_cancelled',
            ])->default('scheduled');

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

            $table->string('invoice_pdf_path')->nullable();
            $table->timestamp('invoice_uploaded_at')->nullable();
            $table->foreignId('invoice_uploaded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('follow_up_deadline')->nullable();
            $table->timestamp('follow_up_reminder_sent_at')->nullable();
            $table->timestamp('follow_up_escalated_to_admin_at')->nullable();

            $table->timestamp('finalized_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_orders');
    }
};