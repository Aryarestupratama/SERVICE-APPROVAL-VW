<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Cek reminder & eskalasi follow-up tiap jam — cukup sering supaya reminder
// H+3 tidak telat lebih dari 1 jam, tanpa perlu jalan tiap menit.
Schedule::command('follow-up:process')->hourly();