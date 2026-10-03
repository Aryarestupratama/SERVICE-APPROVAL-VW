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
    ->middleware('throttle:30,1')
    ->name('public.report.decide');

// Customer membatalkan keputusan approve/reject yang sudah disubmit (item balik
// ke pending). Hanya boleh selama order masih work_in_progress — dijaga di
// controller, bukan cuma disembunyikan di frontend.
Route::post('/report/{token}/undo-decision', [InspectionReportController::class, 'undoDecision'])
    ->middleware('throttle:30,1')
    ->name('public.report.undo-decision');

Route::post('report/{token}/payment-receipt', [InspectionReportController::class, 'uploadPaymentReceipt'])
    ->middleware('throttle:10,1')
    ->name('public.report.upload-payment-receipt');

// Endpoint ringan untuk polling + change-detection (PROJECT-RULES.md bagian
// 12.4/12.6) — dipanggil sering (tiap beberapa detik) dari tab report yang
// terbuka, jadi diberi throttle khusus terpisah dari route publik lain di
// atas supaya tidak kena limit yang sama dengan aksi submit/upload.
Route::get('report/{token}/last-activity', [InspectionReportController::class, 'lastActivity'])
    ->middleware('throttle:120,1')
    ->name('public.report.last-activity');

Route::middleware(['auth', 'verified'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {

        Route::get('/dashboard', DashboardController::class)->name('dashboard');

        // Endpoint ringan untuk polling + change-detection section "In
        // Progress" di Dashboard (pola sama seperti
        // service-orders.last-activity / public.report.last-activity) —
        // throttle terpisah karena dipanggil tiap beberapa detik per tab
        // dashboard yang terbuka.
        Route::get('dashboard/in-progress-activity',
            [DashboardController::class, 'inProgressActivity'])
            ->middleware('throttle:120,1')
            ->name('dashboard.in-progress-activity');

        // Data lengkap In Progress, dipanggil frontend hanya saat
        // in-progress-activity di atas menunjukkan ada perubahan — bukan
        // dipoll langsung tiap interval.
        Route::get('dashboard/in-progress-feed',
            [DashboardController::class, 'inProgressFeed'])
            ->middleware('throttle:120,1')
            ->name('dashboard.in-progress-feed');

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

            // Endpoint ringan untuk polling + change-detection sisi admin
            // (PROJECT-RULES.md bagian 12.4/12.6) — throttle terpisah dari
            // batas default karena dipanggil sering per tab yang terbuka.
            Route::get('service-orders/{serviceOrder}/last-activity',
                [ServiceOrderController::class, 'lastActivity'])
                ->middleware('throttle:120,1')
                ->name('service-orders.last-activity');

            // Update kolom customer_complaint — editable saat appointment &
            // work_in_progress, dikunci backend (isCustomerComplaintEditable())
            // begitu masuk quality_control dst. Ditaruh di grup admin+SA yang
            // sama dengan update-status/payment-details, bukan admin-only,
            // karena SA yang biasanya input & revisi keluhan customer.
            Route::patch('service-orders/{serviceOrder}/customer-complaint',
                [ServiceOrderController::class, 'updateCustomerComplaint'])
                ->name('service-orders.update-customer-complaint');

            // Update inspection_fee (& inspection_fee_note) — editable SA
            // selama status termasuk INSPECTION_FEE_EDITABLE_STATUSES,
            // dikunci backend (isInspectionFeeEditable()). Pola sama dengan
            // update-customer-complaint di atas.
            Route::patch('service-orders/{serviceOrder}/inspection-fee', [ServiceOrderController::class, 'updateInspectionFee'])
                ->name('service-orders.update-inspection-fee');

            // Upload/replace video untuk WO yang SUDAH ADA — tidak digate
            // status (lihat komentar di ServiceOrderController::uploadVideo()).
            // Dipakai untuk mengisi video yang belum pernah diinput maupun
            // memperbaiki video lama yang rusak/hilang (kasus migrasi
            // http->https, lihat PROJECT-RULES.md).
            Route::post('service-orders/{serviceOrder}/video',
                [ServiceOrderController::class, 'uploadVideo'])
                ->name('service-orders.upload-video');

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