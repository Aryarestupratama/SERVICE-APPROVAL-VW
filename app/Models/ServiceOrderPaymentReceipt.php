<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceOrderPaymentReceipt extends Model
{
    public const UPLOADER_CUSTOMER = 'customer';
    public const UPLOADER_STAFF = 'staff';

    protected $fillable = [
        'service_order_id',
        'uploader_type',
        'file_path',
        'uploaded_at',
        'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'uploaded_at' => 'datetime',
        ];
    }

    public function serviceOrder()
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function uploadedBy()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}