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

    // Alasan keterlambatan (TASK-053, FR-041). Dipilih SA lewat select; NULL = tidak terlambat.
    // Hanya boleh diubah saat work_in_progress dan quality_control (keputusan owner). Pada
    // invoice_preparation statusnya sudah paten "Waiting for Pickup", jadi tidak ada delay.
    public const DELAY_WAITING_PART = 'waiting_part';
    public const DELAY_WAITING_APPROVAL = 'waiting_approval';

    public const DELAY_REASONS = [
        self::DELAY_WAITING_PART => 'Waiting Part',
        self::DELAY_WAITING_APPROVAL => 'Waiting Approval',
    ];

    public const DELAY_REASON_EDITABLE_STATUSES = [
        self::STATUS_WORK_IN_PROGRESS,
        self::STATUS_QUALITY_CONTROL,
    ];

    protected $fillable = [
        'vehicle_id',
        'customer_id',
        'service_advisor_id',
        'technician_id',
        'work_order_number',
        'status',
        'items_approval_status',
        'delay_reason',
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

    // Masa berlaku link publik (hari) — dipakai saat create & renew.
    public const INSPECTION_LINK_VALID_DAYS = 30;

    protected static function booted(): void
    {
        static::creating(function (ServiceOrder $order) {
            if (empty($order->inspection_token)) {
                $order->inspection_token = Str::random(32);
                // Default masa berlaku link publik — sesuaikan kalau ada aturan lain
                $order->inspection_token_expires_at = Carbon::now()->addDays(self::INSPECTION_LINK_VALID_DAYS);
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

                // TASK-053: setiap perpindahan status (maju, batal, atau revert) mematikan delay
                // reason dalam save() yang sama, sehingga tidak pernah ada status baru yang
                // masih membawa alasan keterlambatan status lama. Konfirmasi SA diminta di
                // controller sebelum sampai ke sini. Hanya untuk record yang sudah ada: saat
                // insert, `wasRecentlyCreated` masih false sehingga blok ini ikut berjalan.
                if ($order->exists) {
                    $order->delay_reason = null;
                }
            }
        });
    }

    public function vehicle()
    {
        return $this->belongsTo(Vehicle::class);
    }

    // Customer order = primary kendaraan SAAT ORDER DIBUAT (TASK-010 / OQ-5). Disimpan di
    // service_orders.customer_id, jadi mengganti primary kendaraan tidak mengubah order lama.
    // Bukan lagi lewat vehicle; nama dan telepon tetap dibaca dari customers (edit ikut terbawa).
    public function customer()
    {
        return $this->belongsTo(Customer::class);
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

    // Foto hasil perbaikan (maks ServiceOrderRepairImage::MAX_PER_ORDER).
    public function repairImages(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ServiceOrderRepairImage::class)->orderBy('sort_order')->orderBy('id');
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

    // Buat link publik baru (rotasi token + reset masa berlaku). Dipakai saat
    // customer minta link baru setelah link lama expired. Token lama langsung
    // tidak valid. Token harus unik terhadap inspection_token lain DAN
    // feedback_token FUAS (RULE-038 / ADR-013).
    public function renewInspectionLink(): void
    {
        do {
            $token = Str::random(32);
        } while (
            static::where('inspection_token', $token)->exists()
            || ServiceOrderFuas::where('feedback_token', $token)->exists()
        );

        $this->update([
            'inspection_token' => $token,
            'inspection_token_expires_at' => Carbon::now()->addDays(self::INSPECTION_LINK_VALID_DAYS),
            'last_activity_at' => now(),
        ]);
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

    // Guard backend (sumber kebenaran) apakah delay_reason boleh diubah di status saat ini.
    // Dikirim ke Show.jsx sebagai prop supaya UI tidak menduplikasi daftar status.
    public function isDelayReasonEditable(): bool
    {
        return in_array($this->status, self::DELAY_REASON_EDITABLE_STATUSES, true);
    }

    // Guard untuk mematikan delay "Waiting Approval": SA mengonfirmasi customer sudah approve,
    // tetapi data harus cocok. Return pesan error bila masih ada item yang belum diputuskan
    // customer, atau null bila aman. Logika "pending" sama dengan revertStatus().
    public function waitingApprovalBlocker(): ?string
    {
        $pending = $this->inspectionItems()->where('status', 'pending')->count();

        if ($pending === 0) {
            return null;
        }

        return "Cannot turn off Waiting Approval: {$pending} item(s) are still waiting for the customer's decision.";
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