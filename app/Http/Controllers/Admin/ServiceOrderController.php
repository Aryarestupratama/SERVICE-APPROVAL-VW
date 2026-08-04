<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\InspectionItem;
use App\Models\InspectionItemLog;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderEstimationDocument;
use App\Models\ServiceOrderInvoice;
use App\Models\ServiceOrderPaymentReceipt;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\CustomerVehicle;
use App\Models\Setting;
use App\Services\InspectionItemPricingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class ServiceOrderController extends Controller
{
    /**
     * Status yang boleh dipindah manual lewat updateStatus().
     * Guard sederhana dulu (linear, sesuai 5 tahap final di PROJECT-RULES bagian 2).
     * TODO (bagian 7C #4): ini masih versi dasar — belum ada aturan siapa boleh
     * pindah dari status apa ke status apa secara granular per role, dan belum
     * menangani percabangan ke `all_rejected_cancelled`.
     */
    private const ALLOWED_TRANSITIONS = [
        'appointment' => ['work_in_progress'],
        'work_in_progress' => ['quality_control', 'all_rejected_cancelled'],
        'quality_control' => ['invoice_preparation'],
        'invoice_preparation' => ['completed'],
    ];

    public function index(Request $request)
    {
        $user = $request->user();
        $vatPercent = (float) \App\Models\Setting::current()->ppn_percent;

        // Subquery grand total ESTIMASI — semua item apapun statusnya,
        // PPN rate SEKARANG. Formula identik dengan
        // InspectionItemPricingService::breakdownByGroup() (di-sum lintas group).
        $estimateSql = "(SELECT COALESCE(SUM(
                (cost_item * (1 - discount_item_percent / 100))
                + (cost_labour * (1 - discount_labour_percent / 100))
            ), 0) * (1 + ? / 100)
            FROM inspection_items
            WHERE inspection_items.service_order_id = service_orders.id
        )";

        // Subquery grand total APPROVED — SUM final_price_snapshot, item approved saja.
        // Formula identik dengan InspectionItemPricingService::grandTotalForOrder().
        $approvedSql = "(SELECT COALESCE(SUM(final_price_snapshot), 0)
            FROM inspection_items
            WHERE inspection_items.service_order_id = service_orders.id
            AND status = 'approved'
        )";

        $query = ServiceOrder::with(['vehicle.customer', 'serviceAdvisor'])
            ->select('service_orders.*')
            ->selectRaw("{$estimateSql} as grand_total_estimate", [$vatPercent])
            ->selectRaw("{$approvedSql} as grand_total_approved");

        if ($user->role === 'service_advisor') {
            $query->where('service_orders.service_advisor_id', $user->id);
        }

        $query
            ->when($request->search, fn ($q, $search) =>
                $q->where(function ($q2) use ($search) {
                    $q2->where('work_order_number', 'like', "%{$search}%")
                        ->orWhereHas('vehicle.customer', fn ($q3) =>
                            $q3->where('name', 'like', "%{$search}%")
                        )
                        ->orWhereHas('vehicle', fn ($q3) =>
                            $q3->where('plate_number', 'like', "%{$search}%")
                        );
                })
            )
            ->when($request->status, fn ($q, $status) =>
                $q->where('status', $status)
            )
            ->when($request->items_approval_status, fn ($q, $status) =>
                $q->where('items_approval_status', $status)
            );

        // Filter Grand Total — target field dipilih via grand_total_field
        // ('estimate' default, atau 'approved'). Pakai whereRaw dengan subquery
        // yang sama persis (bukan having+alias) supaya paginate()->total() tetap
        // akurat.
        $targetSql = $request->grand_total_field === 'approved' ? $approvedSql : $estimateSql;
        $targetBindings = $request->grand_total_field === 'approved' ? [] : [$vatPercent];

        $query
            ->when($request->grand_total_value, fn ($q, $value) =>
                $q->whereRaw("{$targetSql} = ?", [...$targetBindings, $value])
            )
            ->when($request->grand_total_from, fn ($q, $from) =>
                $q->whereRaw("{$targetSql} >= ?", [...$targetBindings, $from])
            )
            ->when($request->grand_total_to, fn ($q, $to) =>
                $q->whereRaw("{$targetSql} <= ?", [...$targetBindings, $to])
            );

        return Inertia::render('Admin/ServiceOrders/Index', [
            'orders' => $query->latest('service_orders.created_at')->paginate(20)->withQueryString(),
            'search' => $request->search,
            'filters' => $request->only([
                'status', 'items_approval_status',
                'grand_total_field', 'grand_total_value', 'grand_total_from', 'grand_total_to',
            ]),
        ]);
    }

    public function create()
    {
        return Inertia::render('Admin/ServiceOrders/Create', [
            'customers' => Customer::select('id', 'name', 'phone')->orderBy('name')->get(),
            'vehicles' => Vehicle::with('customers:id')
                ->select('id', 'customer_id', 'plate_number', 'brand', 'model', 'year')
                ->orderBy('plate_number')
                ->get(),
            'technicians' => User::where('role', 'chief_technician')
                ->select('id', 'name')
                ->orderBy('name')
                ->get(),
            'brands' => Vehicle::BRANDS,
            'groups' => InspectionItem::GROUPS,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            // Nomor WO fisik dari bengkel, diinput manual oleh SA.
            'work_order_number' => ['required', 'string', 'max:255', 'unique:service_orders,work_order_number'],

            // Customer: pilih yang sudah ada, ATAU isi data baru
            'customer_id' => ['nullable', 'exists:customers,id'],
            'new_customer' => ['nullable', 'array'],
            'new_customer.name' => ['required_with:new_customer', 'string', 'max:255'],
            'new_customer.phone' => ['required_with:new_customer', 'string', 'max:20'],
            'new_customer.email' => ['nullable', 'email', 'max:255'],

            // Vehicle: pilih yang sudah ada, ATAU isi data baru
            'vehicle_id' => ['nullable', 'exists:vehicles,id'],
            'new_vehicle' => ['nullable', 'array'],
            'new_vehicle.plate_number' => ['required_with:new_vehicle', 'string', 'max:20'],
            'new_vehicle.brand' => ['required_with:new_vehicle', Rule::in(Vehicle::BRANDS)],
            'new_vehicle.vin' => ['required_with:new_vehicle', 'string', 'size:17', 'unique:vehicles,vin'],
            'new_vehicle.model' => ['required_with:new_vehicle', 'string', 'max:100'],
            'new_vehicle.year' => ['nullable', 'integer', 'min:1980', 'max:' . (date('Y') + 1)],

            'technician_id' => ['nullable', 'exists:users,id'],
            'personal_message' => ['nullable', 'string'],
            'inspection_fee' => ['required', 'numeric', 'min:0'],
            'inspection_fee_note' => ['nullable', 'string'],

            'inspection_items' => ['required', 'array', 'min:1'],
            'inspection_items.*.name' => ['required', 'string', 'max:255'],
            'inspection_items.*.description' => ['nullable', 'string'],
            'inspection_items.*.cost_item' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.cost_labour' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.discount_item_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.discount_labour_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.group' => ['required', Rule::in(InspectionItem::GROUPS)],

            'videos' => ['nullable', 'array'],
            'videos.*.video_source' => ['required_with:videos', Rule::in(['upload', 'external_link'])],
            'videos.*.video_url' => ['required_if:videos.*.video_source,external_link', 'nullable', 'url'],
            'videos.*.file' => ['required_if:videos.*.video_source,upload', 'nullable', 'file', 'mimes:mp4,mov,webm', 'max:102400'],
        ]);

        if (!$validated['customer_id'] && empty($validated['new_customer'])) {
            return back()->withErrors(['customer_id' => 'Pilih customer yang sudah ada, atau isi data customer baru.']);
        }

        if (!$validated['vehicle_id'] && empty($validated['new_vehicle'])) {
            return back()->withErrors(['vehicle_id' => 'Pilih kendaraan yang sudah ada, atau isi data kendaraan baru.']);
        }

        $serviceOrder = DB::transaction(function () use ($validated, $request) {
            $customerId = $validated['customer_id']
                ?? Customer::create($validated['new_customer'])->id;

            if ($validated['vehicle_id']) {
                $vehicleId = $validated['vehicle_id'];
            } else {
                // customer_id sengaja TIDAK diisi manual di sini — biarkan
                // CustomerVehicleObserver yang mengisi vehicles.customer_id
                // (shortcut denormalized) begitu pivot primary dibuat, supaya
                // satu-satunya jalur penulisan customer_id tetap lewat observer.
                $vehicle = Vehicle::create($validated['new_vehicle']);

                CustomerVehicle::create([
                    'vehicle_id' => $vehicle->id,
                    'customer_id' => $customerId,
                    'is_primary' => true,
                ]);

                $vehicleId = $vehicle->id;
            }

           $order = ServiceOrder::create([
                'vehicle_id' => $vehicleId,
                'service_advisor_id' => $request->user()->id,
                'technician_id' => $validated['technician_id'] ?? null,
                // Nomor WO fisik, diinput manual oleh SA (bukan auto-generate lagi
                // via WorkOrderNumberGenerator — TODO lama bagian 7C #3 sudah tidak
                // relevan, keputusan owner 2026-08-0x mengubah alur ini jadi manual).
                'work_order_number' => $validated['work_order_number'],
                'status' => ServiceOrder::STATUS_APPOINTMENT,
                'items_approval_status' => 'pending',
                'inspection_fee' => $validated['inspection_fee'],
                'inspection_fee_note' => $validated['inspection_fee_note'] ?? null,
                'personal_message' => $validated['personal_message'] ?? null,
            ]);

            foreach ($validated['inspection_items'] as $item) {
                $order->inspectionItems()->create([
                    'name' => $item['name'],
                    'description' => $item['description'] ?? null,
                    'cost_item' => $item['cost_item'],
                    'cost_labour' => $item['cost_labour'],
                    'discount_item_percent' => $item['discount_item_percent'] ?? 0,
                    'discount_labour_percent' => $item['discount_labour_percent'] ?? 0,
                    // final_price_snapshot sengaja TIDAK diisi di sini — tetap null
                    // selama status 'pending', baru dikunci oleh service pricing
                    // (TODO bagian 7C #2) saat item di-approve customer.
                    'group' => $item['group'],
                    'status' => 'pending',
                ]);
            }

            $videosInput = $request->input('videos', []);
            foreach ($videosInput as $index => $video) {
                if ($video['video_source'] === 'external_link') {
                    $order->videos()->create([
                        'video_url' => $video['video_url'],
                        'video_source' => 'external_link',
                        'sort_order' => $index,
                    ]);
                } elseif ($video['video_source'] === 'upload' && $request->hasFile("videos.{$index}.file")) {
                    $path = $request->file("videos.{$index}.file")->store('service-order-videos', 'public');
                    $order->videos()->create([
                        'video_url' => Storage::disk('public')->url($path),
                        'video_source' => 'upload',
                        'sort_order' => $index,
                    ]);
                }
            }

            return $order;
        });

        return redirect()
            ->route('admin.service-orders.show', $serviceOrder->id)
            ->with('success', 'Service order berhasil dibuat.');
    }

    public function show(Request $request, ServiceOrder $serviceOrder, InspectionItemPricingService $pricingService)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Invoice sekarang relasi hasMany (service_order_invoices), bukan kolom
        // tunggal di service_orders — diurutkan sort_order, uploadedBy di-eager-load
        // supaya nama SA yang upload bisa ditampilkan tanpa N+1 query tambahan.
        $serviceOrder->load([
            'vehicle.customer',
            'serviceAdvisor',
            'technician',
            'videos',
            'inspectionItems',
            'invoice.uploadedBy',
            'estimationDocuments.uploadedBy',
            'customerPaymentReceipt',
            'staffPaymentReceipt.uploadedBy',
        ]);

        $settings = Setting::current();

        // Breakdown estimasi (subtotal/VAT/grand total) per group — live calculation
        // dari SEMUA item apapun statusnya, VAT rate SEKARANG (bukan snapshot).
        // Dipindah ke backend (sebelumnya inline di Show.jsx groupBreakdown()) supaya
        // satu sumber angka dengan InspectionItemPricingService::grandTotalForOrder().
        $breakdownByGroup = $pricingService->breakdownByGroup(
            $serviceOrder->inspectionItems,
            (float) $settings->ppn_percent
        );

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
            // Dibutuhkan Show.jsx untuk breakdown PPN (Subtotal/PPN/Grand Total)
            // di kartu Inspection Items — settings.ppn_percent sumber kebenaran
            // tunggal, sama seperti dipakai InspectionItemPricingService di backend.
            'settings' => $settings,
            'groups' => InspectionItem::GROUPS,
            'breakdownByGroup' => $breakdownByGroup,
        ]);
    }

    public function updateStatus(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $validated = $request->validate([
            'status' => ['required', Rule::in([
                ServiceOrder::STATUS_APPOINTMENT,
                ServiceOrder::STATUS_WORK_IN_PROGRESS,
                ServiceOrder::STATUS_QUALITY_CONTROL,
                ServiceOrder::STATUS_INVOICE_PREPARATION,
                ServiceOrder::STATUS_COMPLETED,
                ServiceOrder::STATUS_ALL_REJECTED_CANCELLED,
            ])],
        ]);

        $newStatus = $validated['status'];
        $currentStatus = $serviceOrder->status;

        $allowed = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];
        if (!in_array($newStatus, $allowed, true)) {
            return back()->with('error', "Tidak bisa pindah status dari '{$currentStatus}' ke '{$newStatus}'.");
        }

        // Aturan wajib bagian 7 poin 3: tidak boleh masuk 'quality_control' kalau
        // customer belum selesai memutuskan semua item (finalized_at masih kosong).
        // Mencegah SA pindah status manual sebelum negosiasi item selesai.
        if ($newStatus === ServiceOrder::STATUS_QUALITY_CONTROL && empty($serviceOrder->finalized_at)) {
            return back()->with('error', 'Belum bisa pindah ke Quality Control — customer belum selesai memutuskan semua item inspeksi.');
        }

        // Aturan wajib bagian 2: tidak boleh masuk 'completed' kalau belum ada
        // minimal 1 baris invoice di service_order_invoices (dulu cek kolom
        // invoice_pdf_path tunggal, sekarang cek relasi karena bisa multi-file).
        if ($newStatus === ServiceOrder::STATUS_COMPLETED && !$serviceOrder->hasInvoiceUploaded()) {
            return back()->with('error', 'Upload minimal 1 invoice PDF dulu sebelum menandai order selesai.');
        }

        $updates = ['status' => $newStatus];

        $serviceOrder->update($updates);

        return back()->with('success', 'Status berhasil diperbarui.');
    }

    /**
     * Admin mundurkan status order kembali ke work_in_progress — dipakai saat
     * ada miss komunikasi soal item yang perlu diubah setelah lewat negosiasi
     * (TODO bagian 7 poin 8). Role SA TIDAK bisa memanggil ini — route ini
     * sudah di-guard middleware role:admin, tapi kita cek ulang di sini juga
     * untuk defense-in-depth.
     */
    public function revertStatus(Request $request, ServiceOrder $serviceOrder)
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admin can revert order status.');
        }

        $currentStatus = $serviceOrder->status;
        $target = self::REVERT_TRANSITIONS[$currentStatus] ?? null;

        if ($target === null) {
            return back()->with('error', "Status '{$currentStatus}' tidak bisa dimundurkan.");
        }

        // finalized_at direset karena negosiasi dibuka lagi — guard di
        // updateStatus() (naik ke quality_control) akan menolak sampai
        // customer/SA menyelesaikan ulang semua item pending.
        $serviceOrder->update([
            'status' => $target,
            'finalized_at' => null,
        ]);

        return back()->with('success', "Status dikembalikan ke {$target}.");
    }

    /**
     * Buka lagi item yang 'rejected' supaya bisa dinegosiasikan ulang oleh
     * customer lewat link publik yang sama (TODO bagian 7 poin 8 & poin
     * "reopen inspection item rejected"). Item 'approved' TIDAK bisa direopen
     * di sini — itu dikunci permanen (isLocked()), sesuai keputusan owner.
     *
     * Hanya bisa dipanggil selama order status work_in_progress. Kalau order
     * sudah lewat tahap itu, admin harus revertStatus() dulu.
     */
    public function reopenInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Item hanya bisa dibuka ulang saat status Work In Progress.');
        }

        if ($inspectionItem->status !== 'rejected') {
            return back()->with('error', 'Hanya item dengan status Rejected yang bisa dibuka ulang.');
        }

        DB::transaction(function () use ($inspectionItem, $request, $serviceOrder) {
            $oldStatus = $inspectionItem->status;

            $inspectionItem->update([
                'status' => 'pending',
                'decided_at' => null,
                // final_price_snapshot sudah pasti null untuk item rejected
                // (tidak pernah dikunci), tidak perlu di-reset eksplisit.
            ]);

            $inspectionItem->logs()->create([
                'old_status' => $oldStatus,
                'new_status' => 'pending',
                'actor_type' => 'staff',
                'actor_id' => $request->user()->id,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item berhasil dibuka ulang, menunggu keputusan customer.');
    }

    /**
     * Tambah item inspeksi baru selama negosiasi berjalan (work_in_progress).
     * Item baru selalu mulai dari status 'pending'.
     */
    public function storeInspectionItem(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Item hanya bisa ditambahkan saat status Work In Progress.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'cost_item' => ['required', 'numeric', 'min:0'],
            'cost_labour' => ['required', 'numeric', 'min:0'],
            'discount_item_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_labour_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'group' => ['required', Rule::in(InspectionItem::GROUPS)],
        ]);

        DB::transaction(function () use ($validated, $serviceOrder) {
            $serviceOrder->inspectionItems()->create([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'cost_item' => $validated['cost_item'],
                'cost_labour' => $validated['cost_labour'],
                'discount_item_percent' => $validated['discount_item_percent'] ?? 0,
                'discount_labour_percent' => $validated['discount_labour_percent'] ?? 0,
                'group' => $validated['group'],
                'status' => 'pending',
            ]);

            // Item pending baru berarti negosiasi belum final lagi — reset
            // supaya guard naik ke quality_control ikut kena.
            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item berhasil ditambahkan.');
    }

    /**
     * Edit item yang belum dikunci (pending/rejected). Item 'approved'
     * (isLocked() true) TIDAK BISA diedit — dikunci permanen.
     */
    public function updateInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Item hanya bisa diubah saat status Work In Progress.');
        }

        if ($inspectionItem->isLocked()) {
            return back()->with('error', 'Item yang sudah disetujui customer (approved) tidak bisa diubah.');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'cost_item' => ['required', 'numeric', 'min:0'],
            'cost_labour' => ['required', 'numeric', 'min:0'],
            'discount_item_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_labour_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'group' => ['required', Rule::in(InspectionItem::GROUPS)],
        ]);

        DB::transaction(function () use ($validated, $inspectionItem, $serviceOrder) {
            $wasRejected = $inspectionItem->status === 'rejected';

            $inspectionItem->update([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'cost_item' => $validated['cost_item'],
                'cost_labour' => $validated['cost_labour'],
                'discount_item_percent' => $validated['discount_item_percent'] ?? 0,
                'discount_labour_percent' => $validated['discount_labour_percent'] ?? 0,
                'group' => $validated['group'],
            ]);

            // Edit item yang tadinya rejected TIDAK otomatis reset status jadi
            // pending — itu tanggung jawab endpoint reopenInspectionItem() yang
            // terpisah, supaya SA sadar betul dia sedang "membuka ulang"
            // keputusan customer, bukan efek samping dari edit harga.
            if (!$wasRejected) {
                $this->recalculateApprovalStatus($serviceOrder);
            }
        });

        return back()->with('success', 'Item berhasil diperbarui.');
    }

    /**
     * Hapus item yang belum dikunci (pending/rejected). Item 'approved'
     * TIDAK BISA dihapus.
     */
    public function destroyInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Item hanya bisa dihapus saat status Work In Progress.');
        }

        if ($inspectionItem->isLocked()) {
            return back()->with('error', 'Item yang sudah disetujui customer (approved) tidak bisa dihapus.');
        }

        // Guard tambahan: minimal harus ada 1 item tersisa di order — mencegah
        // SA menghapus semua item sampai order jadi kosong tanpa disadari.
        if ($serviceOrder->inspectionItems()->count() <= 1) {
            return back()->with('error', 'Order harus punya minimal 1 item inspeksi.');
        }

        DB::transaction(function () use ($inspectionItem, $serviceOrder) {
            $inspectionItem->delete();
            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item berhasil dihapus.');
    } 

    /**
     * Upload/replace 1 PDF estimation form untuk 1 kelompok tertentu.
     * updateOrCreate berdasarkan (service_order_id, group) — sesuai constraint
     * unique di migration, jadi upload ulang ke group yang sama otomatis
     * REPLACE file lama (hapus file lama dari storage, ganti pdf_path baru).
     */
    public function uploadEstimationDocument(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Estimation form relevan selama negosiasi berjalan — dikunci begitu
        // order sudah lewat work_in_progress, sama pola guard dengan invoice.
        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Estimation form hanya bisa diubah saat status Work In Progress.');
        }

        $validated = $request->validate([
            'group' => ['required', Rule::in(ServiceOrderEstimationDocument::GROUPS)],
            'pdf' => ['required', 'file', 'mimes:pdf', 'max:10240'],
        ]);

        DB::transaction(function () use ($validated, $request, $serviceOrder) {
            $existing = $serviceOrder->estimationDocuments()
                ->where('group', $validated['group'])
                ->first();

            // Hapus file lama dari storage kalau ini replace, bukan upload pertama.
            if ($existing && $existing->pdf_path) {
                Storage::disk('public')->delete($existing->pdf_path);
            }

            $path = $request->file('pdf')->store('estimation-documents', 'public');

            ServiceOrderEstimationDocument::updateOrCreate(
                [
                    'service_order_id' => $serviceOrder->id,
                    'group' => $validated['group'],
                ],
                [
                    'pdf_path' => $path,
                    'uploaded_at' => now(),
                    'uploaded_by' => $request->user()->id,
                ]
            );
        });

        return back()->with('success', 'Estimation form berhasil diupload.');
    }

    /**
     * Hapus PDF estimation form untuk 1 kelompok tertentu — baris tetap ada
     * (atau dihapus total, tergantung preferensi), tapi pdf_path di-null-kan
     * supaya slot itu kembali kosong dan bisa diupload ulang.
     */
    public function deleteEstimationDocument(Request $request, ServiceOrder $serviceOrder, ServiceOrderEstimationDocument $estimationDocument)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($estimationDocument->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
            return back()->with('error', 'Estimation form hanya bisa dihapus saat status Work In Progress.');
        }

        if ($estimationDocument->pdf_path) {
            Storage::disk('public')->delete($estimationDocument->pdf_path);
        }

        $estimationDocument->delete();

        return back()->with('success', 'Estimation form berhasil dihapus.');
    }

    /**
     * Upload/replace invoice PDF — REPLACE, bukan append (revisi balik ke
     * 1 WO : 1 invoice, PROJECT-RULES.md bagian 2 & TODO bagian 7).
     * updateOrCreate berdasarkan service_order_id (constraint unique),
     * upload ulang otomatis ganti file lama.
     */
    public function uploadInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status === ServiceOrder::STATUS_COMPLETED) {
            return back()->with('error', 'Order sudah completed, invoice tidak bisa diubah lagi.');
        }

        $validated = $request->validate([
            'invoice_pdf' => ['required', 'file', 'mimes:pdf', 'max:10240'],
        ]);

        DB::transaction(function () use ($validated, $request, $serviceOrder) {
            $existing = $serviceOrder->invoice;

            if ($existing && $existing->file_path) {
                Storage::disk('public')->delete($existing->file_path);
            }

            $path = $request->file('invoice_pdf')->store('invoices', 'public');

            ServiceOrderInvoice::updateOrCreate(
                ['service_order_id' => $serviceOrder->id],
                [
                    'file_path' => $path,
                    'uploaded_at' => now(),
                    'uploaded_by' => $request->user()->id,
                ]
            );
        });

        return back()->with('success', 'Invoice PDF berhasil diupload.');
    }

    /**
     * Hapus invoice milik order ini. Tidak perlu parameter invoice id lagi
     * karena maksimal 1 baris per order.
     */
    public function deleteInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status === ServiceOrder::STATUS_COMPLETED) {
            return back()->with('error', 'Order sudah completed, invoice tidak bisa dihapus lagi.');
        }

        $invoice = $serviceOrder->invoice;

        if (!$invoice) {
            return back()->with('error', 'Tidak ada invoice untuk dihapus.');
        }

        Storage::disk('public')->delete($invoice->file_path);
        $invoice->delete();

        return back()->with('success', 'Invoice PDF berhasil dihapus.');
    }

    /**
     * Update invoice_number & bill_to (input manual SA) — PROJECT-RULES.md
     * TODO bagian 7 poin 5. Hanya bisa diubah selama invoice_preparation.
     */
    public function updatePaymentDetails(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status !== ServiceOrder::STATUS_INVOICE_PREPARATION) {
            return back()->with('error', 'Payment details hanya bisa diubah saat status Invoice Preparation.');
        }

        $validated = $request->validate([
            'invoice_number' => ['nullable', 'string', 'max:255'],
            'bill_to' => ['nullable', 'string', 'max:255'],
        ]);

        $serviceOrder->update($validated);

        return back()->with('success', 'Payment details berhasil disimpan.');
    }

    /**
     * Upload/replace receipt versi SA (bukti transfer yang diterima kasir/SA,
     * berbeda dari bukti bayar yang diupload customer sendiri).
     */
    public function uploadStaffPaymentReceipt(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status !== ServiceOrder::STATUS_INVOICE_PREPARATION) {
            return back()->with('error', 'Receipt hanya bisa diupload saat status Invoice Preparation.');
        }

        $validated = $request->validate([
            'receipt' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        DB::transaction(function () use ($validated, $request, $serviceOrder) {
            $existing = $serviceOrder->staffPaymentReceipt;

            if ($existing && $existing->file_path) {
                Storage::disk('public')->delete($existing->file_path);
            }

            $path = $request->file('receipt')->store('payment-receipts', 'public');

            ServiceOrderPaymentReceipt::updateOrCreate(
                [
                    'service_order_id' => $serviceOrder->id,
                    'uploader_type' => ServiceOrderPaymentReceipt::UPLOADER_STAFF,
                ],
                [
                    'file_path' => $path,
                    'uploaded_at' => now(),
                    'uploaded_by' => $request->user()->id,
                ]
            );
        });

        return back()->with('success', 'Receipt berhasil diupload.');
    }

    public function deleteStaffPaymentReceipt(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $receipt = $serviceOrder->staffPaymentReceipt;

        if (!$receipt) {
            return back()->with('error', 'Tidak ada receipt untuk dihapus.');
        }

        Storage::disk('public')->delete($receipt->file_path);
        $receipt->delete();

        return back()->with('success', 'Receipt berhasil dihapus.');
    }

    /**
     * Semua admin & SA bisa akses order apapun (bukan cuma order miliknya
     * sendiri) — keputusan owner: skema ini sengaja dibuat supaya SA lain
     * bisa backup/handle order kalau SA yang aslinya berhalangan. Middleware
     * role:admin,service_advisor di routes sudah membatasi role yang boleh
     * masuk; method ini jadi murni defense-in-depth (menolak role selain itu),
     * bukan lagi cek kepemilikan order per-SA.
     */
    private function authorizeAccess(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if (in_array($user->role, ['admin', 'service_advisor'], true)) {
            return;
        }

        abort(403, 'Anda tidak punya akses ke service order ini.');
    }

    /**
     * Transisi MUNDUR khusus admin — dipakai reopen item rejected di luar
     * work_in_progress (TODO bagian 7 poin 8). SA tidak boleh melakukan ini,
     * hanya admin, sesuai keputusan owner.
     */
    private const REVERT_TRANSITIONS = [
        'quality_control' => 'work_in_progress',
        'invoice_preparation' => 'work_in_progress',
        'completed' => 'work_in_progress',
    ];

    /**
     * Hitung ulang items_approval_status & finalized_at berdasarkan kondisi
     * item TERKINI. Dipanggil setiap kali ada perubahan item (tambah/edit/
     * hapus/reopen) selama work_in_progress, supaya guard naik ke
     * quality_control (butuh finalized_at terisi) selalu akurat.
     *
     * Logika sama persis dengan yang ada di
     * InspectionReportController::submitDecisions() — sengaja diduplikasi
     * di sini (bukan diekstrak ke service class) untuk task ini, refactor
     * penyatuan logic bisa jadi TODO terpisah kalau dirasa perlu nanti.
     */
    private function recalculateApprovalStatus(ServiceOrder $serviceOrder): void
    {
        $freshItems = $serviceOrder->inspectionItems()->get();

        $stillPending = $freshItems->contains(fn ($item) => $item->status === 'pending');
        $allRejected = $freshItems->isNotEmpty() && $freshItems->every(fn ($item) => $item->status === 'rejected');
        $allApproved = $freshItems->isNotEmpty() && $freshItems->every(fn ($item) => $item->status === 'approved');

        $itemsApprovalStatus = match (true) {
            $allRejected => 'rejected',
            $allApproved => 'approved',
            default => 'partially_approved',
        };

        $updates = ['items_approval_status' => $itemsApprovalStatus];

        // Kalau masih ada item pending, negosiasi belum final —
        // finalized_at HARUS null supaya guard naik ke quality_control nolak.
        $updates['finalized_at'] = $stillPending ? null : now();

        $serviceOrder->update($updates);
    }
}