<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

class CustomerVehicle extends Pivot
{
    protected $table = 'customer_vehicle';

    protected $casts = [
        'is_primary' => 'boolean',
    ];
}