<?php

namespace App\Models;

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

    // Order-order yang dibuat SA ini
    public function serviceOrders()
    {
        return $this->hasMany(ServiceOrder::class, 'service_advisor_id');
    }

    // Order-order yang dikerjakan teknisi ini
    public function assignedServiceOrders()
    {
        return $this->hasMany(ServiceOrder::class, 'technician_id');
    }
}