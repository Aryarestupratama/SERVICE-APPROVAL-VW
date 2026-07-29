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
                'brand' => 'Volkswagen',
                'model' => 'Tiguan',
                'year' => 2021,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'customer_id' => 2, // Rina Kusuma
                'plate_number' => 'B 5678 XYZ',
                'brand' => 'Volkswagen',
                'model' => 'Polo',
                'year' => 2019,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'customer_id' => 3, // Hendra Gunawan
                'plate_number' => 'B 9012 DEF',
                'brand' => 'Volkswagen',
                'model' => 'Golf',
                'year' => 2022,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}