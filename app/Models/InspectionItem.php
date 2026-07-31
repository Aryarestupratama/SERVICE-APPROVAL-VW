<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InspectionItem extends Model
{
    protected $fillable = [
        'service_order_id',
        'name',
        'description',
        'cost_item',
        'cost_labour',
        'discount_item_percent',
        'discount_labour_percent',
        'final_price_snapshot',
        'is_urgent',
        'status', // pending, approved, rejected
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'cost_item' => 'decimal:2',
            'cost_labour' => 'decimal:2',
            'discount_item_percent' => 'decimal:2',
            'discount_labour_percent' => 'decimal:2',
            'final_price_snapshot' => 'decimal:2',
            'is_urgent' => 'boolean',
            'decided_at' => 'datetime',
        ];
    }

    public function serviceOrder()
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function logs()
    {
        return $this->hasMany(InspectionItemLog::class);
    }

    /**
     * Subtotal sebelum diskon (cost_item + cost_labour saja, belum PPN).
     * Ini murni angka mentah untuk ditampilkan/dihitung ulang —
     * BUKAN harga final. Harga final yang mengikat ada di final_price_snapshot,
     * yang hanya diisi & dikunci lewat service class kalkulasi saat item di-approve.
     */
    public function getRawSubtotalAttribute(): float
    {
        return (float) $this->cost_item + (float) $this->cost_labour;
    }

    /**
     * Subtotal setelah diskon per komponen diterapkan (masih belum PPN).
     * Dipakai oleh service class kalkulasi sebagai input sebelum PPN ditambahkan.
     */
    public function getSubtotalAfterDiscountAttribute(): float
    {
        $itemAfterDiscount = (float) $this->cost_item * (1 - ((float) $this->discount_item_percent / 100));
        $labourAfterDiscount = (float) $this->cost_labour * (1 - ((float) $this->discount_labour_percent / 100));

        return $itemAfterDiscount + $labourAfterDiscount;
    }

    public function isLocked(): bool
    {
        return $this->final_price_snapshot !== null;
    }
}