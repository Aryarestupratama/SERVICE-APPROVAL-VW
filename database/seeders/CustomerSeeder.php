<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        Customer::create([
            'name' => 'Andi Wijaya',
            'phone' => '081311122233',
            'email' => 'andi.wijaya@gmail.com',
        ]);

        Customer::create([
            'name' => 'Rina Kusuma',
            'phone' => '081344455566',
            'email' => 'rina.kusuma@gmail.com',
        ]);

        Customer::create([
            'name' => 'Hendra Gunawan',
            'phone' => '081377788899',
            'email' => null,
        ]);
    }
}