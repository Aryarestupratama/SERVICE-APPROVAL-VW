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
            $table->string('google_maps_url');        // link pendek, untuk tombol "Buka di Google Maps"
            $table->string('google_maps_embed_url')->nullable(); // src iframe, untuk peta embed
            $table->string('website_url')->nullable();
            $table->decimal('ppn_percent', 5, 2)->default(11.00);

            // Thank You section (Revisi Besar #2, poin 9)
            $table->string('era_phone')->nullable();              // contoh: "14023"
            $table->string('booking_whatsapp_phone')->nullable(); // pengganti whatsapp_number lama, format 62xxx
            $table->string('survey_form_url')->nullable();        // link survey eksternal

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};