<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceOrderRepairImage extends Model
{
    /**
     * Batas jumlah foto perbaikan per order (keputusan owner). Sumber
     * kebenaran ada di sini; controller dan UI membaca konstanta ini.
     */
    public const MAX_PER_ORDER = 5;

    protected $fillable = [
        'service_order_id',
        'image_path',
        'description',
        'sort_order',
        'uploaded_by',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
