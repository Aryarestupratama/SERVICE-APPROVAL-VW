<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = [
        'workshop_name',
        'logo_path',
        'hero_image_path',
        'address',
        'phone',
        'whatsapp_number',
        'google_maps_url',
        'website_url',
    ];

    // Single row config — helper untuk akses cepat tanpa query berulang
    public static function current(): self
    {
        return static::query()->firstOrFail();
    }
}