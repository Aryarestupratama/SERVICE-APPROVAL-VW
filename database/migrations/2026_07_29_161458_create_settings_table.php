<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('workshop_name');
            $table->string('logo_path')->nullable();
            $table->string('hero_image_path')->nullable();
            $table->text('address');
            $table->string('phone');
            $table->string('whatsapp_number'); // format 62xxx
            $table->string('google_maps_url');
            $table->string('website_url')->nullable();
            $table->decimal('ppn_percent', 5, 2)->default(11.00);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};