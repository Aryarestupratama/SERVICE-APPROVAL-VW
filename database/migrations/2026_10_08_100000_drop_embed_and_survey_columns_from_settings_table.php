<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TASK-024 / FR-023: peta embed dan tombol survey/feedback dihapus dari halaman publik,
 * jadi kolom yang hanya melayani keduanya ikut dihapus.
 *
 * `google_maps_url` SENGAJA dipertahankan: tombol "Open in Maps" masih dipakai.
 * Cadangkan database sebelum menjalankan migration ini.
 */
return new class extends Migration
{
    public function up(): void
    {
        $drop = array_values(array_filter(
            ['google_maps_embed_url', 'survey_form_url'],
            fn (string $column) => Schema::hasColumn('settings', $column),
        ));

        if ($drop !== []) {
            Schema::table('settings', function (Blueprint $table) use ($drop) {
                $table->dropColumn($drop);
            });
        }
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'google_maps_embed_url')) {
                $table->text('google_maps_embed_url')->nullable()->after('google_maps_url');
            }
            if (! Schema::hasColumn('settings', 'survey_form_url')) {
                $table->string('survey_form_url')->nullable();
            }
        });
    }
};
