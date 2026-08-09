<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DashboardSaController;
use App\Http\Controllers\Admin\DashboardPartController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\SettingController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\VehicleController;
use App\Http\Controllers\Admin\CustomerVehicleImportController;
use App\Http\Controllers\Admin\VehicleCustomerController; 
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

Route::post('report/{token}/payment-receipt', [InspectionReportController::class, 'uploadPaymentReceipt'])
    ->name('public.report.upload-payment-receipt');

Route::middleware(['auth', 'verified'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {

        Route::get('/dashboard', DashboardController::class)->name('dashboard');

        Route::middleware('role:admin,service_advisor')->group(function () {
            Route::get('dashboards/sa-performance', [DashboardSaController::class, 'index'])
                ->name('dashboards.sa-performance');

            Route::get('dashboards/part-performance', [DashboardPartController::class, 'index'])
                ->name('dashboards.part-performance');

            Route::resource('customers', CustomerController::class);
            Route::resource('vehicles', VehicleController::class);
            Route::prefix('vehicle-customer-import')->name('vehicle-customer-import.')->group(function () {
                Route::get('/', [CustomerVehicleImportController::class, 'create'])->name('create');
                Route::post('preview', [CustomerVehicleImportController::class, 'preview'])->name('preview');
                Route::post('commit', [CustomerVehicleImportController::class, 'commit'])->name('commit');
                Route::delete('cancel', [CustomerVehicleImportController::class, 'cancel'])->name('cancel');
            });

            Route::prefix('vehicle-customers')->name('vehicle-customers.')->group(function () {
                Route::get('/', [VehicleCustomerController::class, 'index'])->name('index');
                Route::post('/', [VehicleCustomerController::class, 'store'])->name('store');
                Route::patch('{customerVehicle}/set-primary', [VehicleCustomerController::class, 'setPrimary'])->name('set-primary');
                Route::delete('{customerVehicle}', [VehicleCustomerController::class, 'destroy'])->name('destroy');
            });

            // 'destroy' dikeluarkan dari resource ini — dipindah ke grup
            // role:admin di bawah, karena hapus service order permanen
            // sengaja dibatasi admin-only (keputusan owner), bukan SA.
            Route::resource('service-orders', ServiceOrderController::class)
                ->except(['destroy']);

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

            // Update kolom customer_complaint — editable saat appointment &
            // work_in_progress, dikunci backend (isCustomerComplaintEditable())
            // begitu masuk quality_control dst. Ditaruh di grup admin+SA yang
            // sama dengan update-status/payment-details, bukan admin-only,
            // karena SA yang biasanya input & revisi keluhan customer.
            Route::patch('service-orders/{serviceOrder}/customer-complaint',
                [ServiceOrderController::class, 'updateCustomerComplaint'])
                ->name('service-orders.update-customer-complaint');

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

            // Hard delete service order — PERMANEN, admin-only (keputusan
            // owner). Sengaja dipisah dari resource() di grup admin+SA di
            // atas. Route ini otomatis menghasilkan nama
            // 'admin.service-orders.destroy' sesuai konvensi resource,
            // walau didaftarkan manual (bukan lewat Route::resource) di sini.
            Route::delete('service-orders/{serviceOrder}',
                [ServiceOrderController::class, 'destroy'])
                ->name('service-orders.destroy');
        });
    });

require __DIR__.'/auth.php';