<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        User::create([
            'name' => 'Admin VW PIK',
            'email' => 'admin@vwpik.test',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'phone' => '081234567890',
        ]);

        User::create([
            'name' => 'Budi Santoso',
            'email' => 'budi.sa@vwpik.test',
            'password' => Hash::make('password'),
            'role' => 'service_advisor',
            'phone' => '081298765432',
        ]);

        User::create([
            'name' => 'Sarah Amelia',
            'email' => 'sarah.sa@vwpik.test',
            'password' => Hash::make('password'),
            'role' => 'service_advisor',
            'phone' => '081211122233',
        ]);
    }
}