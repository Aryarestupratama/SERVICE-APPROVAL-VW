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

    /**
     * SEMUA service order dari kendaraan yang terhubung ke customer ini —
     * baik sebagai Primary maupun PIC (lewat pivot customer_vehicle),
     * BUKAN cuma vehicle yang customer_id shortcut-nya menunjuk ke customer ini.
     *
     * Kenapa tidak pakai hasManyThrough seperti sebelumnya: hasManyThrough
     * butuh FK langsung (vehicles.customer_id), yang cuma diisi untuk
     * primary customer oleh CustomerVehicleObserver — customer yang cuma
     * jadi PIC (is_primary = false) di suatu vehicle tidak akan ke-capture.
     * (PROJECT-RULES.md bagian 7 TODO "Revisit Customer::serviceOrders()".)
     */
    public function serviceOrders()
    {
        return ServiceOrder::whereHas('vehicle.customers', function ($query) {
            $query->where('customers.id', $this->id);
        });
    }
}