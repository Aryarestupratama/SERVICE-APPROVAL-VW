<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VehicleSeeder extends Seeder
{
    public function run(): void
    {
        $vehicles = [
            [
                'customer_id' => 1, // Andi Wijaya
                'plate_number' => 'B 1234 ABC',
                'brand' => 'VW',
                'vin' => 'WVWZZZ1KZAM123456',
                'model' => 'Tiguan',
                'year' => 2021,
            ],
            [
                'customer_id' => 2, // Rina Kusuma
                'plate_number' => 'B 5678 XYZ',
                'brand' => 'VW',
                'vin' => 'WVWZZZ6RZKY654321',
                'model' => 'Polo',
                'year' => 2019,
            ],
            [
                'customer_id' => 3, // Hendra Gunawan
                'plate_number' => 'B 9012 DEF',
                'brand' => 'VW',
                'vin' => 'WVWZZZAUZNP789012',
                'model' => 'Golf',
                'year' => 2022,
            ],
        ];

        $now = now();

        foreach ($vehicles as $vehicle) {
            $customerId = $vehicle['customer_id'];

            $vehicleId = DB::table('vehicles')->insertGetId([
                ...$vehicle,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('customer_vehicle')->insert([
                'customer_id' => $customerId,
                'vehicle_id' => $vehicleId,
                'is_primary' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}