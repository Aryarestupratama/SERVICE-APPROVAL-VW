<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

class CustomerVehicle extends Pivot
{
    protected $table = 'customer_vehicle';

    // Override default Pivot: tabel ini PUNYA auto-increment id beneran
    // ($table->id() di migration) — tanpa ini, Eloquent tidak fetch ulang
    // lastInsertId() setelah create(), $model->id tetap null di memory,
    // dan CustomerVehicleObserver::saved() salah exclude diri sendiri
    // (where('id','!=',null) dikonversi Laravel jadi whereNotNull('id'),
    // ikut match row yang baru dibuat, is_primary ketimpa balik jadi false).
    public $incrementing = true;

    protected $casts = [
        'is_primary' => 'boolean',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }
}