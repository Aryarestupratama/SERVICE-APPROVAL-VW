<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;

class ServiceOrder extends Model
{
    // Status utama order — 5 tahap alur + 1 status cabang (batal)
    public const STATUS_APPOINTMENT = 'appointment';
    public const STATUS_WORK_IN_PROGRESS = 'work_in_progress';
    public const STATUS_QUALITY_CONTROL = 'quality_control';
    public const STATUS_INVOICE_PREPARATION = 'invoice_preparation';
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
        'finalized_at',
        'invoice_number',
        'bill_to',
    ];

    protected function casts(): array
    {
        return [
            'inspection_fee' => 'decimal:2',
            'inspection_token_expires_at' => 'datetime',
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

    public function videos()
    {
        return $this->hasMany(ServiceOrderVideo::class)->orderBy('sort_order');
    }

    public function inspectionItems()
    {
        return $this->hasMany(InspectionItem::class);
    }

    public function estimationDocuments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ServiceOrderEstimationDocument::class);
    }

    // Helper cek link publik masih valid atau sudah expired
    public function isInspectionLinkExpired(): bool
    {
        return $this->inspection_token_expires_at !== null
            && $this->inspection_token_expires_at->isPast();
    }

    public function invoice()
    {
        return $this->hasOne(ServiceOrderInvoice::class);
    }

    // Halaman publik & guard status 'completed' wajib cek ini — order dianggap
    // punya invoice kalau minimal 1 baris ada di service_order_invoices
    // (PROJECT-RULES bagian 7 poin 2: guard completed cek tabel ini, bukan
    // lagi kolom invoice_pdf_path yang sudah dihapus).
    public function hasInvoiceUploaded(): bool
    {
        return $this->invoice()->exists();
    }

    public function customerPaymentReceipt()
    {
        return $this->hasOne(ServiceOrderPaymentReceipt::class)
            ->where('uploader_type', ServiceOrderPaymentReceipt::UPLOADER_CUSTOMER);
    }

    public function staffPaymentReceipt()
    {
        return $this->hasOne(ServiceOrderPaymentReceipt::class)
            ->where('uploader_type', ServiceOrderPaymentReceipt::UPLOADER_STAFF);
    }
}