<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InspectionItem extends Model
{
    protected $fillable = [
        'service_order_id',
        'name',
        'description',
        'cost',
        'is_urgent',
        'status', // pending, approved, rejected
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'cost' => 'decimal:2',
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
}