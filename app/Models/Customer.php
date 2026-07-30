<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $fillable = [
        'name',
        'phone',
        'email',
    ];

    public function vehicles()
    {
        return $this->hasMany(Vehicle::class);
    }

    public function serviceOrders()
    {
        return ServiceOrder::whereHas('vehicle', function ($query) {
            $query->where('customer_id', $this->id);
        });
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}