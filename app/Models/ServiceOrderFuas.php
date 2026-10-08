<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pelacak pengiriman form feedback FUAS (Follow Up After Service), satu baris per order.
 *
 * Status FUAS TIDAK disimpan di sini; selalu dihitung oleh FuasStatusService (RULE-036).
 * Baris dibuat lazily oleh FuasController::prepare.
 */
class ServiceOrderFuas extends Model
{
    public const CATEGORIES = [
        'service_initiation' => 'Service Initiation',
        'service_advisor' => 'Service Advisor',
        'service_facility' => 'Service Facility',
        'vehicle_pick_up' => 'Vehicle Pick Up',
        'service_quality' => 'Service Quality',
    ];

    protected $table = 'service_order_fuas';

    protected $fillable = [
        'service_order_id',
        'feedback_token',
        'sent_count',
        'first_sent_at',
        'last_sent_at',
        'last_sent_by',
        'submitted_at',
        'satisfaction_score',
        'recommend_score',
        'vehicle_issue_note',
        'suggestion',
        'suggestion_categories',
    ];

    // Token tidak ikut ter-serialize ke props Inertia secara tidak sengaja.
    protected $hidden = ['feedback_token'];

    protected function casts(): array
    {
        return [
            'sent_count' => 'integer',
            'satisfaction_score' => 'integer',
            'recommend_score' => 'integer',
            'first_sent_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'submitted_at' => 'datetime',
            'suggestion_categories' => 'array',
        ];
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function lastSentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_sent_by');
    }
}
