<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;

class ServiceOrder extends Model
{
    // Status utama order — 5 tahap alur + 1 status cabang (batal)
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_QUALITY_CONTROL = 'quality_control';
    public const STATUS_FOLLOW_UP = 'follow_up';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_ALL_REJECTED_CANCELLED = 'all_rejected_cancelled';

    // Status agregat approval item (terpisah dari status utama di atas)
    public const ITEMS_APPROVAL_PENDING = 'pending';
    public const ITEMS_APPROVAL_PARTIALLY_APPROVED = 'partially_approved';
    public const ITEMS_APPROVAL_APPROVED = 'approved';
    public const ITEMS_APPROVAL_REJECTED = 'rejected';

    protected $fillable = [
        'vehicle_id',
        'service_advisor_id',
        'technician_id',
        'work_order_number',
        'status',
        'items_approval_status',
        'inspection_fee',
        'inspection_fee_note',
        'personal_message',
        'inspection_token',
        'inspection_token_expires_at',
        'invoice_pdf_path',
        'invoice_uploaded_at',
        'invoice_uploaded_by',
        'follow_up_deadline',
        'follow_up_reminder_sent_at',
        'follow_up_escalated_to_admin_at',
        'finalized_at',
    ];

    protected function casts(): array
    {
        return [
            'inspection_fee' => 'decimal:2',
            'inspection_token_expires_at' => 'datetime',
            'invoice_uploaded_at' => 'datetime',
            'follow_up_deadline' => 'datetime',
            'follow_up_reminder_sent_at' => 'datetime',
            'follow_up_escalated_to_admin_at' => 'datetime',
            'finalized_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (ServiceOrder $order) {
            if (empty($order->inspection_token)) {
                $order->inspection_token = Str::random(32);
                // Default masa berlaku link publik — sesuaikan kalau ada aturan lain
                $order->inspection_token_expires_at = Carbon::now()->addDays(30);
            }
        });
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }

    // Akses customer selalu lewat vehicle, karena tidak ada FK langsung
    public function customer()
    {
        return $this->hasOneThrough(
            Customer::class,
            Vehicle::class,
            'id',          // FK di vehicles yang mengarah ke... (local key vehicles)
            'id',          // FK di customers
            'vehicle_id',  // local key di service_orders
            'customer_id'  // local key di vehicles
        );
    }

    public function serviceAdvisor()
    {
        return $this->belongsTo(User::class, 'service_advisor_id');
    }

    public function technician()
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function invoiceUploadedBy()
    {
        return $this->belongsTo(User::class, 'invoice_uploaded_by');
    }

    public function videos()
    {
        return $this->hasMany(ServiceOrderVideo::class)->orderBy('sort_order');
    }

    public function inspectionItems()
    {
        return $this->hasMany(InspectionItem::class);
    }

    // Helper cek link publik masih valid atau sudah expired
    public function isInspectionLinkExpired(): bool
    {
        return $this->inspection_token_expires_at !== null
            && $this->inspection_token_expires_at->isPast();
    }

    // Halaman publik wajib tampilkan viewer invoice kalau ini true
    public function hasInvoiceUploaded(): bool
    {
        return ! empty($this->invoice_pdf_path);
    }
}