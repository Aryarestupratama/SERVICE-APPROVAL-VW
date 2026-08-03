<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    // Daftar merk yang diizinkan — single source of truth untuk validasi
    // di controller/request, supaya tidak hardcode array ['Audi', 'VW'] di banyak tempat.
    public const BRANDS = ['Audi', 'VW'];

    protected $fillable = [
        'customer_id',
        'plate_number',
        'brand',
        'vin',
        'model',
        'year',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class); // shortcut ke primary customer
    }

    public function customers()
    {
        return $this->belongsToMany(Customer::class, 'customer_vehicle')
            ->using(CustomerVehicle::class)
            ->withPivot('is_primary')
            ->withTimestamps();
    }

    public function serviceOrders()
    {
        return $this->hasMany(ServiceOrder::class);
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}