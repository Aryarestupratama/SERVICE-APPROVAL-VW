<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VehicleSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('vehicles')->insert([
            [
                'customer_id' => 1, // Andi Wijaya
                'plate_number' => 'B 1234 ABC',
                'brand' => 'VW',
                'vin' => 'WVWZZZ1KZAM123456',
                'model' => 'Tiguan',
                'year' => 2021,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'customer_id' => 2, // Rina Kusuma
                'plate_number' => 'B 5678 XYZ',
                'brand' => 'VW',
                'vin' => 'WVWZZZ6RZKY654321',
                'model' => 'Polo',
                'year' => 2019,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'customer_id' => 3, // Hendra Gunawan
                'plate_number' => 'B 9012 DEF',
                'brand' => 'VW',
                'vin' => 'WVWZZZAUZNP789012',
                'model' => 'Golf',
                'year' => 2022,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}