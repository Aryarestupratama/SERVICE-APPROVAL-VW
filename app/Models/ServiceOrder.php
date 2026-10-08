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

    // Status di mana kolom customer_complaint masih boleh diedit.
    // Begitu status masuk quality_control / invoice_preparation / completed /
    // all_rejected_cancelled, kolom ini di-lock (read-only) — guard dipakai di
    // ServiceOrderController (mirip pola guard finalized_at yang sudah ada).
    public const CUSTOMER_COMPLAINT_EDITABLE_STATUSES = [
        self::STATUS_APPOINTMENT,
        self::STATUS_WORK_IN_PROGRESS,
    ];

    // Status di mana inspection_fee (& inspection_fee_note) masih boleh
    // diedit SA — sengaja dibuat sedikit lebih longgar dari
    // CUSTOMER_COMPLAINT_EDITABLE_STATUSES (ikut quality_control) karena
    // Grand Total (Confirmed Total + inspection_fee) baru benar-benar
    // final saat masuk invoice_preparation. ASUMSI, tolong dikonfirmasi
    // ke owner kalau perlu beda aturan.
    public const INSPECTION_FEE_EDITABLE_STATUSES = [
        self::STATUS_APPOINTMENT,
        self::STATUS_WORK_IN_PROGRESS,
        self::STATUS_QUALITY_CONTROL,
    ];

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
        'customer_complaint',
        'inspection_token',
        'inspection_token_expires_at',
        'finalized_at',
        'invoice_number',
        'bill_to',
        'last_activity_at',
    ];

    protected function casts(): array
    {
        return [
            'inspection_fee' => 'decimal:2',
            'inspection_token_expires_at' => 'datetime',
            'finalized_at' => 'datetime',
            'status_changed_at' => 'datetime',
            'last_activity_at' => 'datetime',
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

            // status_changed_at diisi juga saat create, supaya order baru
            // langsung punya basis waktu yang benar untuk proxy "lama di status"
            // (bukan kosong sampai status pertama kali berubah).
            $order->status_changed_at = Carbon::now();
        });

        // Auto-set status_changed_at HANYA saat kolom status benar-benar berubah
        // nilainya — bukan tiap kali record di-save() untuk alasan lain (misal
        // update harga item, edit customer_complaint, dst). Ini menggantikan
        // proxy updated_at yang sebelumnya dipakai di Dashboard (PROJECT-RULES
        // bagian 7 — TODO ini sebelumnya ditunda karena butuh event handling,
        // sekarang diimplementasikan di sini sebagai satu-satunya tempat yang
        // men-set kolom ini; controller manapun yang mengubah status TIDAK perlu
        // set status_changed_at secara manual).
        static::saving(function (ServiceOrder $order) {
            if ($order->isDirty('status') && ! $order->wasRecentlyCreated) {
                $order->status_changed_at = Carbon::now();
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

    // Pelacak FUAS (satu baris per order, dibuat lazily; lihat FuasStatusService).
    public function fuas(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ServiceOrderFuas::class);
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

    // Helper cek apakah customer_complaint masih boleh diedit di status saat ini.
    // Dipakai di ServiceOrderController (guard backend) dan bisa juga dikirim
    // sebagai prop ke frontend (Show.jsx) supaya field di-disable di UI tanpa
    // perlu duplikasi daftar status di sisi React.
    public function isCustomerComplaintEditable(): bool
    {
        return in_array($this->status, self::CUSTOMER_COMPLAINT_EDITABLE_STATUSES, true);
    }

    // Guard backend (sumber kebenaran) untuk apakah inspection_fee masih
    // boleh diedit SA — dipakai di ServiceOrderController::updateInspectionFee()
    // dan dikirim ke Show.jsx sebagai prop supaya field di-disable di UI
    // tanpa duplikasi daftar status di sisi React.
    public function isInspectionFeeEditable(): bool
    {
        return in_array($this->status, self::INSPECTION_FEE_EDITABLE_STATUSES, true);
    }

    /**
     * Hitung items_approval_status dari koleksi inspection items yang
     * diberikan. Satu-satunya tempat logika ini didefinisikan — sebelumnya
     * ditulis ulang terpisah di ServiceOrderController::recalculateApprovalStatus()
     * dan InspectionReportController::submitDecisions() dengan guard
     * isNotEmpty() yang tidak konsisten antara keduanya. Sekarang kedua
     * controller memanggil method ini.
     *
     * @param \Illuminate\Support\Collection<int, InspectionItem> $items
     */
    public static function computeApprovalStatus($items): string
    {
        $allRejected = $items->isNotEmpty() && $items->every(fn ($item) => $item->status === 'rejected');
        $allApproved = $items->isNotEmpty() && $items->every(fn ($item) => $item->status === 'approved');

        return match (true) {
            $allRejected => self::ITEMS_APPROVAL_REJECTED,
            $allApproved => self::ITEMS_APPROVAL_APPROVED,
            default => self::ITEMS_APPROVAL_PARTIALLY_APPROVED,
        };
    }

    /**
     * Cek apakah masih ada item berstatus 'pending' di koleksi yang
     * diberikan — dipakai bersamaan dengan computeApprovalStatus() untuk
     * menentukan finalized_at di kedua controller.
     *
     * @param \Illuminate\Support\Collection<int, InspectionItem> $items
     */
    public static function hasPendingItems($items): bool
    {
        return $items->contains(fn ($item) => $item->status === 'pending');
    }

    /**
     * Tandai order ini "baru saja berubah" untuk keperluan polling +
     * change-detection (PROJECT-RULES.md bagian 12) — dipanggil di setiap
     * titik perubahan yang relevan ditampilkan di Admin/ServiceOrders/Show.jsx
     * atau Public/InspectionReport.jsx. Satu-satunya tempat kolom
     * last_activity_at disentuh secara eksplisit di luar update() yang sudah
     * menyertakan kolom ini di array-nya sendiri (lihat pemanggil di kedua
     * controller). Query terpisah (bukan digabung ke update() lain) supaya
     * tetap konsisten dipanggil walau tidak ada kolom lain yang berubah,
     * misalnya saat upload/delete file.
     */
    public function touchActivity(): void
    {
        $this->touch('last_activity_at');
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