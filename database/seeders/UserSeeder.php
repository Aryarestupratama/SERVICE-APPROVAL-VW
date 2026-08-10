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
            'name' => 'Mariyono',
            'email' => 'mariyono@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'phone' => '08128989744',
        ]);

        User::create([
            'name' => 'Admin VW PIK Service',
            'email' => 'adminvwpikservice@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'phone' => '0800000000',
            'email_verified_at' => now(),
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
            'name' => 'Genta Sunarya',
            'email' => 'genta.sunarya@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'chief_technician',
            'phone' => '081319614931',
            'email_verified_at' => now(),
        ]);

        User::create([
            'name' => 'Rojabim Maruf',
            'email' => 'rojabim.maruf@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'chief_technician',
            'phone' => '081212764645',
            'email_verified_at' => now(),
        ]);

        User::create([
            'name' => 'Slamet Nurohim',
            'email' => 'slamet.nurohim@vw.co.id',
            'password' => Hash::make('password'),
            'role' => 'chief_technician',
            'phone' => '087777333135',
            'email_verified_at' => now(),
        ]);
    }
}