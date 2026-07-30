<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceOrderVideo extends Model
{
    protected $fillable = [
        'service_order_id',
        'video_url',
        'video_source', // upload, external_link
        'sort_order',
        'duration_seconds',
    ];

    public function serviceOrder()
    {
        return $this->belongsTo(ServiceOrder::class);
    }
}