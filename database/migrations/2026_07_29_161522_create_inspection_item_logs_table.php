<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inspection_item_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inspection_item_id')->constrained()->cascadeOnDelete();
            $table->string('old_status');
            $table->string('new_status');
            $table->enum('actor_type', ['customer', 'staff']);
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inspection_item_logs');
    }
};