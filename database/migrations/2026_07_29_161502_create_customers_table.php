<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Salutation/title customer — enum Mr./Mrs./Mss. (PROJECT-RULES.md
            // bagian 2). Label UI: "Prefix" (keputusan owner, final).
            $table->enum('title', ['Mr.', 'Mrs.', 'Mss.'])->nullable();
            $table->string('phone');
            $table->string('email')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};