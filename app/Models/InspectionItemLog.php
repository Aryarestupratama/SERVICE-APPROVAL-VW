<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InspectionItemLog extends Model
{
    protected $fillable = [
        'inspection_item_id',
        'old_status',
        'new_status',
        'actor_type', // customer, staff
        'actor_id',
        'ip_address',
        'user_agent',
    ];

    public $timestamps = true; // butuh created_at buat urutan histori

    public function inspectionItem()
    {
        return $this->belongsTo(InspectionItem::class);
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}