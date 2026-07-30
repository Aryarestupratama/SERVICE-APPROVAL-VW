<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;

class ServiceOrder extends Model
{
    protected $fillable = [
        'vehicle_id',
        'service_advisor_id',
        'technician_id',
        'status',
        'inspection_fee',
        'inspection_fee_note',
        'personal_message',
        'inspection_token',
        'inspection_token_expires_at',
        'invoice_token',
        'finalized_at',
    ];

    protected function casts(): array
    {
        return [
            'inspection_fee' => 'decimal:2',
            'inspection_token_expires_at' => 'datetime',
            'finalized_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (ServiceOrder $order) {
            if (empty($order->inspection_token)) {
                $order->inspection_token = Str::random(32);
                // Default masa berlaku link publik — sesuaikan kalau ada aturan lain
                $order->inspection_token_expires_at = Carbon::now()->addDays(30);
            }
        });
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }

    // Akses customer selalu lewat vehicle, karena tidak ada FK langsung
    public function customer()
    {
        return $this->hasOneThrough(
            Customer::class,
            Vehicle::class,
            'id',          // FK di vehicles yang mengarah ke... (local key vehicles)
            'id',          // FK di customers
            'vehicle_id',  // local key di service_orders
            'customer_id'  // local key di vehicles
        );
    }

    public function serviceAdvisor()
    {
        return $this->belongsTo(User::class, 'service_advisor_id');
    }

    public function technician()
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function videos()
    {
        return $this->hasMany(ServiceOrderVideo::class)->orderBy('sort_order');
    }

    public function inspectionItems()
    {
        return $this->hasMany(InspectionItem::class);
    }

    public function invoice()
    {
        return $this->hasOne(Invoice::class);
    }

    // Helper cek link publik masih valid atau sudah expired
    public function isInspectionLinkExpired(): bool
    {
        return $this->inspection_token_expires_at !== null
            && $this->inspection_token_expires_at->isPast();
    }
}