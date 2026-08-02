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
            //'google_maps_embed_url' => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d31735.988564140873!2d106.7352064!3d-6.130892800000001!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e6a1dc62a83ca45%3A0xbe45b433947e0452!2sIndomobil%20Volkswagen%20PIK!5e0!3m2!1sid!2sid!4v1785666703754!5m2!1sid!2sid',
            'website_url' => 'https://www.vw.com/en.html',
            'ppn_percent' => 11.00,

            // Thank You section (Revisi Besar #2, poin 9)
            'era_phone' => '14023',
            'booking_whatsapp_phone' => '62818698989',
            'survey_form_url' => 'https://forms.gle/rKydHaiUS246j5uT7',

            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}