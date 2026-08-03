<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'photo_path',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * Normalisasi nomor telepon staff ke format 62xxx (tanpa "+" di depan).
     * Sama persis dengan pola Customer::phone() — lihat PROJECT-RULES.md
     * bagian 2 & TODO bagian 7 (link WhatsApp SA di halaman publik).
     */
    protected function phone(): Attribute
    {
        return Attribute::make(
            set: function (string $value) {
                $digits = preg_replace('/\D/', '', $value);

                if (str_starts_with($digits, '0')) {
                    $digits = '62' . substr($digits, 1);
                } elseif (! str_starts_with($digits, '62')) {
                    $digits = '62' . $digits;
                }

                return $digits;
            },
        );
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isServiceAdvisor(): bool
    {
        return $this->role === 'service_advisor';
    }

    public function isChiefTechnician(): bool
    {
        return $this->role === 'chief_technician';
    }

    public function serviceOrders()
    {
        return $this->hasMany(ServiceOrder::class, 'service_advisor_id');
    }

    public function assignedServiceOrders()
    {
        return $this->hasMany(ServiceOrder::class, 'technician_id');
    }
}