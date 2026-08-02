<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\SettingController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\VehicleController;
use App\Http\Controllers\Admin\ServiceOrderController;
use App\Http\Controllers\Admin\NotificationController;

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

        Route::post('notifications/{id}/read', [NotificationController::class, 'markAsRead'])
            ->name('notifications.read');
        Route::post('notifications/read-all', [NotificationController::class, 'markAllAsRead'])
            ->name('notifications.read-all');

        Route::middleware('role:admin,service_advisor')->group(function () {
            Route::resource('customers', CustomerController::class);
            Route::resource('vehicles', VehicleController::class);
            Route::resource('service-orders', ServiceOrderController::class);

            Route::patch('service-orders/{serviceOrder}/status',
                [ServiceOrderController::class, 'updateStatus'])
                ->name('service-orders.update-status');

            Route::post('service-orders/{serviceOrder}/estimation-document',
                [ServiceOrderController::class, 'uploadEstimationDocument'])
                ->name('service-orders.upload-estimation-document');

            Route::delete('service-orders/{serviceOrder}/estimation-documents/{estimationDocument}',
                [ServiceOrderController::class, 'deleteEstimationDocument'])
                ->name('service-orders.delete-estimation-document');

            Route::post('service-orders/{serviceOrder}/invoice',
                [ServiceOrderController::class, 'uploadInvoice'])
                ->name('service-orders.upload-invoice');

            Route::delete('service-orders/{serviceOrder}/invoices/{invoice}',
                [ServiceOrderController::class, 'deleteInvoice'])
                ->name('service-orders.delete-invoice');
        });

        // Admin-only — staff & workshop config
        Route::middleware('role:admin')->group(function () {
            Route::resource('users', UserController::class)
                ->except(['show']);

            Route::get('settings', [SettingController::class, 'edit'])
                ->name('settings.edit');
            Route::put('settings', [SettingController::class, 'update'])
                ->name('settings.update');
        });
    });

require __DIR__.'/auth.php';