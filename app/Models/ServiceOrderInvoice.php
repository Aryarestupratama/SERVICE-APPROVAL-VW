<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceOrderInvoice extends Model
{
    protected $fillable = [
        'service_order_id',
        'file_path',
        'sort_order',
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

    /**
     * Label tampil "Invoice 1", "Invoice 2", dst — diturunkan dari sort_order,
     * bukan disimpan sebagai kolom terpisah. Pola yang sama dengan
     * ServiceOrderVideo (label "Part N" dari sort_order).
     */
    public function getLabelAttribute(): string
    {
        return 'Invoice ' . ($this->sort_order + 1);
    }
}