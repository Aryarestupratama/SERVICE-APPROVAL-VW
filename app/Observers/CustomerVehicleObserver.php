<?php

namespace App\Observers;

use App\Models\CustomerVehicle;
use Illuminate\Support\Facades\DB;

class CustomerVehicleObserver
{
    /**
     * Saat sebuah pivot row di-set is_primary = true, pastikan tidak ada
     * pivot row lain untuk vehicle yang sama yang masih is_primary = true,
     * lalu sinkronkan vehicles.customer_id.
     */
    public function saved(CustomerVehicle $pivot): void
    {
        if (! $pivot->is_primary) {
            return;
        }

        DB::transaction(function () use ($pivot) {
            CustomerVehicle::where('vehicle_id', $pivot->vehicle_id)
                ->where('id', '!=', $pivot->id)
                ->update(['is_primary' => false]);

            DB::table('vehicles')
                ->where('id', $pivot->vehicle_id)
                ->update(['customer_id' => $pivot->customer_id]);
        });
    }

    /**
     * Kalau pivot row primary dihapus, reassign customer_id ke PIC lain
     * yang tersisa (kalau ada), atau null-kan kalau tidak ada PIC tersisa.
     */
    public function deleted(CustomerVehicle $pivot): void
    {
        if (! $pivot->is_primary) {
            return;
        }

        $fallback = CustomerVehicle::where('vehicle_id', $pivot->vehicle_id)
            ->orderBy('id')
            ->first();

        if ($fallback) {
            $fallback->update(['is_primary' => true]); // akan trigger saved() lagi
        } else {
            DB::table('vehicles')
                ->where('id', $pivot->vehicle_id)
                ->update(['customer_id' => null]);
        }
    }
}