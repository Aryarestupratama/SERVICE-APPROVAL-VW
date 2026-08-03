<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    /**
     * Salutation/title customer — label UI: "Prefix" (keputusan owner, final).
     * PROJECT-RULES.md bagian 2.
     */
    public const TITLES = ['Mr.', 'Mrs.', 'Mss.'];

    protected $fillable = [
        'name',
        'title',
        'phone',
        'email',
    ];

    protected function phone(): Attribute
    {
        return Attribute::make(
            set: function (string $value) {
                // Buang semua karakter selain digit (spasi, strip, kurung, dsb)
                $digits = preg_replace('/\D/', '', $value);

                // Normalisasi ke format 62xxx tanpa tanda "+" di depan
                if (str_starts_with($digits, '0')) {
                    $digits = '62' . substr($digits, 1);
                } elseif (! str_starts_with($digits, '62')) {
                    $digits = '62' . $digits;
                }

                return $digits;
            },
        );
    }

    public function vehicles()
    {
        return $this->belongsToMany(Vehicle::class, 'customer_vehicle')
            ->using(CustomerVehicle::class)
            ->withPivot('is_primary')
            ->withTimestamps();
    }

    public function primaryVehicles()
    {
        return $this->hasMany(Vehicle::class); // via vehicles.customer_id, shortcut
    }

    public function serviceOrders()
    {
        return $this->hasManyThrough(
            ServiceOrder::class,
            Vehicle::class,
            'customer_id',  // FK di tabel Vehicle yang mengarah ke Customer
            'vehicle_id',   // FK di tabel ServiceOrder yang mengarah ke Vehicle
            'id',           // local key di Customer
            'id'            // local key di Vehicle
        );
    }
}