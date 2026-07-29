<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('customers')->insert([
            [
                'name' => 'Andi Wijaya',
                'phone' => '081311122233',
                'email' => 'andi.wijaya@gmail.com',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Rina Kusuma',
                'phone' => '081344455566',
                'email' => 'rina.kusuma@gmail.com',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Hendra Gunawan',
                'phone' => '081377788899',
                'email' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}