<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // RULE-056: db:seed tanpa --class tidak boleh jalan di production.
        // Di production, jalankan seeder tertentu secara eksplisit (--class=...).
        if (app()->isProduction() && ! env('ALLOW_DEMO_SEED')) {
            $this->command?->error('DatabaseSeeder dihentikan: environment production. Gunakan --class=NamaSeeder untuk seeder tertentu.');

            return;
        }

        $this->call([
            SettingsSeeder::class,
            UserSeeder::class,
            DemoDataSeeder::class,
            FuasDemoSeeder::class,
        ]);
    }
}