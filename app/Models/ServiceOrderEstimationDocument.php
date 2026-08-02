<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceOrderEstimationDocument extends Model
{
    /**
     * Sama seperti InspectionItem::GROUPS — urutan tampil tetap mengikuti
     * urutan array ini. Kalau ada perubahan di salah satu, pastikan disamakan
     * di kedua tempat (PROJECT-RULES.md bagian 2).
     */
    public const GROUPS = [
        'related',
        'safety',
        'durability',
        'experience',
        'appearance',
    ];

    protected $fillable = [
        'service_order_id',
        'group',
        'pdf_path',
        'uploaded_at',
        'uploaded_by',
    ];

    protected $casts = [
        'uploaded_at' => 'datetime',
    ];

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /**
     * Slot ini sudah ada file estimation form-nya atau belum.
     * Dipakai di admin Show.jsx / controller supaya nggak perlu cek
     * pdf_path !== null berulang-ulang di banyak tempat.
     */
    public function hasFile(): bool
    {
        return !empty($this->pdf_path);
    }
}