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
            'address' => 'Jl. Pantai Indah Kapuk, Jakarta Utara',
            'phone' => '0215550123',
            'whatsapp_number' => '628111234567',
            'google_maps_url' => 'https://maps.google.com/?q=Volkswagen+PIK',
            'website_url' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}