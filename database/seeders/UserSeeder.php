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
            'name' => 'Mariyono',
            'email' => 'mariyono@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'phone' => '08128989744',
        ]);

        User::create([
            'name' => 'Bayu Mega Widiyantoro',
            'email' => 'bayu.widiyantoro@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'service_advisor',
            'phone' => '081210073612',
        ]);

        User::create([
            'name' => 'Mhd Noor Maulana Haditya',
            'email' => 'haditya.mhd@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'service_advisor',
            'phone' => '085289001244',
        ]);

        User::create([
            'name' => 'Agus Wijaya',
            'email' => 'agus.tech@vwpik.test',
            'password' => Hash::make('password'),
            'role' => 'chief_technician',
            'phone' => '081233344455',
            'email_verified_at' => now(),
        ]);

        User::create([
            'name' => 'Rudi Hartono',
            'email' => 'rudi.tech@vwpik.test',
            'password' => Hash::make('password'),
            'role' => 'chief_technician',
            'phone' => '081266677788',
            'email_verified_at' => now(),
        ]);
    }
}