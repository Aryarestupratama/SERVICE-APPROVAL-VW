<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('settings')->insert([
            'workshop_name' => 'Volkswagen PIK',
            'logo_path' => null,
            'hero_image_path' => null,
            'address' => 'Jl. Pantai Indah Selatan A 1 ST, RT.001/RW.6, Kapuk Muara, Kecamatan Penjaringan, Jkt Utara, Daerah Khusus Ibukota Jakarta 14460',
            'phone' => '62215881321',
            'google_maps_url' => 'https://maps.app.goo.gl/7nQgYTZV2Mr1GUmR9',
            'website_url' => 'https://www.vw.com/en.html',
            'ppn_percent' => 11.00,

            // Thank You section (Revisi Besar #2, poin 9)
            'era_phone' => '14023',
            'booking_whatsapp_phone' => '62818698989',

            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}