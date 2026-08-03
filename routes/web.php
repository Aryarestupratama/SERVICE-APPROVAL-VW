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

Route::post('report/{token}/payment-receipt', [InspectionReportController::class, 'uploadPaymentReceipt'])
    ->name('public.report.upload-payment-receipt');

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

            Route::post('service-orders/{serviceOrder}/inspection-items',
                [ServiceOrderController::class, 'storeInspectionItem'])
                ->name('service-orders.inspection-items.store');

            Route::patch('service-orders/{serviceOrder}/inspection-items/{inspectionItem}',
                [ServiceOrderController::class, 'updateInspectionItem'])
                ->name('service-orders.inspection-items.update');

            Route::delete('service-orders/{serviceOrder}/inspection-items/{inspectionItem}',
                [ServiceOrderController::class, 'destroyInspectionItem'])
                ->name('service-orders.inspection-items.destroy');

            Route::post('service-orders/{serviceOrder}/inspection-items/{inspectionItem}/reopen',
                [ServiceOrderController::class, 'reopenInspectionItem'])
                ->name('service-orders.inspection-items.reopen');

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

            Route::delete('service-orders/{serviceOrder}/invoice', 
                [ServiceOrderController::class, 'deleteInvoice'])
                ->name('service-orders.delete-invoice');

            Route::patch('service-orders/{serviceOrder}/payment-details',
                [ServiceOrderController::class, 'updatePaymentDetails'])
                ->name('service-orders.update-payment-details');

            Route::post('service-orders/{serviceOrder}/payment-receipt/staff',
                [ServiceOrderController::class, 'uploadStaffPaymentReceipt'])
                ->name('service-orders.upload-staff-payment-receipt');

            Route::delete('service-orders/{serviceOrder}/payment-receipt/staff',
                [ServiceOrderController::class, 'deleteStaffPaymentReceipt'])
                ->name('service-orders.delete-staff-payment-receipt');
        });

        // Admin-only — staff & workshop config
        Route::middleware('role:admin')->group(function () {
            Route::resource('users', UserController::class)
                ->except(['show']);

            Route::get('settings', [SettingController::class, 'edit'])
                ->name('settings.edit');
            Route::put('settings', [SettingController::class, 'update'])
                ->name('settings.update');

            Route::patch('service-orders/{serviceOrder}/revert-status',
                [ServiceOrderController::class, 'revertStatus'])
                ->name('service-orders.revert-status');
        });
    });

require __DIR__.'/auth.php';