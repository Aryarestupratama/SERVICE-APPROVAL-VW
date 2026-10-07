<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->text('google_maps_embed_url')->nullable()->change();
            $table->text('google_maps_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->string('google_maps_embed_url')->nullable()->change();
            $table->string('google_maps_url')->nullable()->change();
        });
    }
};