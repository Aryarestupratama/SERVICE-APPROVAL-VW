<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\VehicleController;
use App\Http\Controllers\Admin\ServiceOrderController;

use App\Http\Controllers\Public\InspectionReportController;

// Root: bukan halaman render, cuma gerbang redirect sesuai status auth
Route::get('/', function () {
    return auth()->check()
        ? redirect()->route('admin.dashboard')
        : redirect()->route('login');
});

Route::get('/report/{token}', [InspectionReportController::class, 'show'])
    ->name('public.inspection-report');

    Route::post('/report/{token}/decide', [App\Http\Controllers\Public\InspectionReportController::class, 'submitDecisions'])
    ->name('public.report.decide');

Route::middleware(['auth', 'verified'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {

        Route::get('/dashboard', DashboardController::class)->name('dashboard');

        Route::middleware('role:admin,service_advisor')->group(function () {
            Route::resource('customers', CustomerController::class);
            Route::resource('vehicles', VehicleController::class);
            Route::resource('service-orders', ServiceOrderController::class);

            Route::patch('service-orders/{serviceOrder}/status',
                [ServiceOrderController::class, 'updateStatus'])
                ->name('service-orders.update-status');
        });
    });

require __DIR__.'/auth.php';