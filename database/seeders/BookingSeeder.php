<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class BookingSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('bookings')->insert([
            [
                'customer_id' => 1, // Andi Wijaya, sudah jadi customer terdaftar
                'vehicle_id' => 1,
                'name' => 'Andi Wijaya',
                'phone' => '081311122233',
                'preferred_date' => now()->addDays(3)->toDateString(),
                'preferred_time' => '10:00:00',
                'notes' => 'Servis berkala 20rb km',
                'status' => 'confirmed',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'customer_id' => null, // belum jadi customer terdaftar
                'vehicle_id' => null,
                'name' => 'Fajar Ramadhan',
                'phone' => '081388899900',
                'preferred_date' => now()->addDays(5)->toDateString(),
                'preferred_time' => '14:00:00',
                'notes' => 'Mau cek AC kurang dingin',
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}