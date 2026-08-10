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
use App\Rules\MaxVideoDuration;
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

        $estimateSql = "(SELECT COALESCE(SUM(
                (cost_item * (1 - discount_item_percent / 100))
                + (cost_labour * (1 - discount_labour_percent / 100))
            ), 0) * (1 + ? / 100)
            FROM inspection_items
            WHERE inspection_items.service_order_id = service_orders.id
        )";

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

        $sortDir = $request->sort_dir === 'asc' ? 'asc' : 'desc';
        $directSortColumns = ['work_order_number', 'status'];

        if ($request->sort_by === 'grand_total_estimate') {
            $query->orderByRaw("{$estimateSql} {$sortDir}", [$vatPercent]);
        } elseif ($request->sort_by === 'grand_total_approved') {
            $query->orderByRaw("{$approvedSql} {$sortDir}");
        } elseif (in_array($request->sort_by, $directSortColumns, true)) {
            $query->orderBy($request->sort_by, $sortDir);
        } else {
            $query->latest('service_orders.created_at');
        }

        return Inertia::render('Admin/ServiceOrders/Index', [
            'orders' => $query->paginate(20)->withQueryString(),
            'search' => $request->search,
            'filters' => $request->only([
                'status', 'items_approval_status',
                'grand_total_field', 'grand_total_value', 'grand_total_from', 'grand_total_to',
                'sort_by', 'sort_dir',
            ]),
        ]);
    }

    public function create()
    {
        return Inertia::render('Admin/ServiceOrders/Create', [
            'customers' => Customer::select('id', 'name', 'phone')->orderBy('name')->get(),
            'vehicles' => Vehicle::with('customers:id')
                ->select('id', 'customer_id', 'plate_number', 'brand', 'model')
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
            'work_order_number' => ['required', 'string', 'max:255', 'unique:service_orders,work_order_number'],

            'customer_id' => ['nullable', 'exists:customers,id'],
            'new_customer' => ['nullable', 'array'],
            'new_customer.name' => ['required_with:new_customer', 'string', 'max:255'],
            'new_customer.phone' => ['required_with:new_customer', 'string', 'max:20'],
            'new_customer.email' => ['nullable', 'email', 'max:255'],

            'vehicle_id' => ['nullable', 'exists:vehicles,id'],
            'new_vehicle' => ['nullable', 'array'],
            'new_vehicle.plate_number' => ['required_with:new_vehicle', 'string', 'max:20'],
            'new_vehicle.brand' => ['required_with:new_vehicle', Rule::in(Vehicle::BRANDS)],
            'new_vehicle.vin' => ['required_with:new_vehicle', 'string', 'size:17', 'unique:vehicles,vin'],
            'new_vehicle.model' => ['required_with:new_vehicle', 'string', 'max:100'],

            'technician_id' => ['nullable', 'exists:users,id'],
            'personal_message' => ['nullable', 'string'],
            'inspection_fee' => ['required', 'numeric', 'min:0'],
            'inspection_fee_note' => ['nullable', 'string'],

            // Keluhan/permintaan customer, diinput SA saat create order — masih
            // editable saat work_in_progress lewat updateCustomerComplaint(),
            // dikunci begitu masuk quality_control (lihat
            // ServiceOrder::CUSTOMER_COMPLAINT_EDITABLE_STATUSES).
            'customer_complaint' => ['nullable', 'string'],

            'inspection_items' => ['required', 'array', 'min:1'],
            'inspection_items.*.name' => ['required', 'string', 'max:255'],
            'inspection_items.*.description' => ['nullable', 'string'],
            'inspection_items.*.cost_item' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.cost_labour' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.discount_item_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.discount_labour_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.group' => ['required', Rule::in(InspectionItem::GROUPS)],

            'videos' => ['nullable', 'array', 'max:1'],
            'videos.*.video_source' => ['required_with:videos', Rule::in(['upload', 'external_link'])],
            'videos.*.video_url' => ['required_if:videos.*.video_source,external_link', 'nullable', 'url'],
            'videos.*.file' => [
                'required_if:videos.*.video_source,upload',
                'nullable',
                'file',
                'mimes:mp4,mov,webm',
                'max:102400',
                new MaxVideoDuration(120),
            ],
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
                'work_order_number' => $validated['work_order_number'],
                'status' => ServiceOrder::STATUS_APPOINTMENT,
                'items_approval_status' => 'pending',
                'inspection_fee' => $validated['inspection_fee'],
                'inspection_fee_note' => $validated['inspection_fee_note'] ?? null,
                'personal_message' => $validated['personal_message'] ?? null,
                'customer_complaint' => $validated['customer_complaint'] ?? null,
            ]);

            foreach ($validated['inspection_items'] as $item) {
                $order->inspectionItems()->create([
                    'name' => $item['name'],
                    'description' => $item['description'] ?? null,
                    'cost_item' => $item['cost_item'],
                    'cost_labour' => $item['cost_labour'],
                    'discount_item_percent' => $item['discount_item_percent'] ?? 0,
                    'discount_labour_percent' => $item['discount_labour_percent'] ?? 0,
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
                        'duration_seconds' => null,
                    ]);
                } elseif ($video['video_source'] === 'upload' && $request->hasFile("videos.{$index}.file")) {
                    $file = $request->file("videos.{$index}.file");

                    $getID3 = new \getID3();
                    $info = $getID3->analyze($file->getRealPath());
                    $durationSeconds = isset($info['playtime_seconds'])
                        ? (int) round($info['playtime_seconds'])
                        : null;

                    $path = $file->store('service-order-videos', 'public');
                    $order->videos()->create([
                        'video_url' => Storage::disk('public')->url($path),
                        'video_source' => 'upload',
                        'sort_order' => $index,
                        'duration_seconds' => $durationSeconds,
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

        $breakdownByGroup = $pricingService->breakdownByGroup(
            $serviceOrder->inspectionItems,
            (float) $settings->ppn_percent
        );

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
            'settings' => $settings,
            'groups' => InspectionItem::GROUPS,
            'breakdownByGroup' => $breakdownByGroup,
            // customer_complaint sendiri ada di dalam 'order' (kolom model
            // biasa), tapi flag editability dikirim terpisah supaya Show.jsx
            // tidak perlu menduplikasi daftar status "editable" — satu sumber
            // kebenaran tetap di ServiceOrder::isCustomerComplaintEditable().
            'customerComplaintEditable' => $serviceOrder->isCustomerComplaintEditable(),
        ]);
    }

    /**
     * Update kolom customer_complaint secara terpisah dari update lain — dipakai
     * saat SA mengubah keluhan customer selama appointment/work_in_progress.
     * Dikunci (ditolak backend) begitu status masuk quality_control dan
     * seterusnya, walaupun request-nya "berhasil sampai" ke server (mis. tab
     * lama yang belum di-refresh, atau race condition status berubah barusan) —
     * guard ini sumber kebenaran final, bukan cuma disable tombol di frontend.
     */
    public function updateCustomerComplaint(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if (!$serviceOrder->isCustomerComplaintEditable()) {
            return back()->with('error', 'Customer complaint tidak bisa diubah lagi setelah order masuk Quality Control.');
        }

        $validated = $request->validate([
            'customer_complaint' => ['nullable', 'string'],
        ]);

        $serviceOrder->update($validated);

        return back()->with('success', 'Customer complaint berhasil disimpan.');
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

        if ($newStatus === ServiceOrder::STATUS_QUALITY_CONTROL && empty($serviceOrder->finalized_at)) {
            return back()->with('error', 'Belum bisa pindah ke Quality Control — customer belum selesai memutuskan semua item inspeksi.');
        }

        if ($newStatus === ServiceOrder::STATUS_COMPLETED && !$serviceOrder->hasInvoiceUploaded()) {
            return back()->with('error', 'Upload minimal 1 invoice PDF dulu sebelum menandai order selesai.');
        }

        $updates = ['status' => $newStatus];

        $serviceOrder->update($updates);

        return back()->with('success', 'Status berhasil diperbarui.');
    }

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

        $serviceOrder->update([
            'status' => $target,
            'finalized_at' => null,
        ]);

        return back()->with('success', "Status dikembalikan ke {$target}.");
    }

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

            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item berhasil ditambahkan.');
    }

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

            if (!$wasRejected) {
                $this->recalculateApprovalStatus($serviceOrder);
            }
        });

        return back()->with('success', 'Item berhasil diperbarui.');
    }

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

        if ($serviceOrder->inspectionItems()->count() <= 1) {
            return back()->with('error', 'Order harus punya minimal 1 item inspeksi.');
        }

        DB::transaction(function () use ($inspectionItem, $serviceOrder) {
            $inspectionItem->delete();
            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item berhasil dihapus.');
    } 

    public function uploadEstimationDocument(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

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

            $oldPath = $existing?->pdf_path;

            // Simpan file baru DULU — kalau ini gagal, file lama masih utuh.
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

            // Baru hapus file lama SETELAH file baru + row DB dipastikan berhasil.
            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }
        });

        return back()->with('success', 'Estimation form berhasil diupload.');
    }

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
            $oldPath = $existing?->file_path;

            $path = $request->file('invoice_pdf')->store('invoices', 'public');

            ServiceOrderInvoice::updateOrCreate(
                ['service_order_id' => $serviceOrder->id],
                [
                    'file_path' => $path,
                    'uploaded_at' => now(),
                    'uploaded_by' => $request->user()->id,
                ]
            );

            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }
        });

        return back()->with('success', 'Invoice PDF berhasil diupload.');
    }

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
            $oldPath = $existing?->file_path;

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

            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }
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
     * Hard delete service order — HANYA admin, berlaku untuk SEMUA status
     * termasuk 'completed' (keputusan owner, terutama untuk keperluan bersih-
     * bersih WO dummy/testing setelah live di hosting). Row anak (inspection
     * items, videos, estimation documents, invoice, payment receipts) ikut
     * terhapus lewat cascadeOnDelete() di migration masing-masing — TAPI file
     * fisik di storage TIDAK otomatis ikut kehapus oleh cascade DB, jadi wajib
     * dibersihkan manual di sini SEBELUM $serviceOrder->delete() dipanggil.
     *
     * TIDAK ADA guard status di sini secara sengaja — order tetap bisa dihapus
     * walau customer sudah approve/reject item, sudah completed, dsb. Ini
     * DESTRUKTIF dan PERMANEN, tidak ada soft delete/recovery. Konfirmasi di
     * frontend (AlertDialog) wajib eksplisit sebelum memanggil endpoint ini.
     */
    public function destroy(Request $request, ServiceOrder $serviceOrder)
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admin can delete a service order.');
        }

        $serviceOrder->load([
            'videos',
            'estimationDocuments',
            'invoice',
            'customerPaymentReceipt',
            'staffPaymentReceipt',
        ]);

        DB::transaction(function () use ($serviceOrder) {
            // Video upload lokal (video_source = 'upload') punya file fisik di
            // disk 'public'. Video 'external_link' (mis. YouTube) tidak punya
            // file untuk dihapus — video_url-nya cuma string URL eksternal.
            foreach ($serviceOrder->videos as $video) {
                if ($video->video_source === 'upload' && $video->video_url) {
                    $path = str_replace(Storage::disk('public')->url(''), '', $video->video_url);
                    Storage::disk('public')->delete($path);
                }
            }

            foreach ($serviceOrder->estimationDocuments as $doc) {
                if ($doc->pdf_path) {
                    Storage::disk('public')->delete($doc->pdf_path);
                }
            }

            if ($serviceOrder->invoice && $serviceOrder->invoice->file_path) {
                Storage::disk('public')->delete($serviceOrder->invoice->file_path);
            }

            if ($serviceOrder->customerPaymentReceipt && $serviceOrder->customerPaymentReceipt->file_path) {
                Storage::disk('public')->delete($serviceOrder->customerPaymentReceipt->file_path);
            }

            if ($serviceOrder->staffPaymentReceipt && $serviceOrder->staffPaymentReceipt->file_path) {
                Storage::disk('public')->delete($serviceOrder->staffPaymentReceipt->file_path);
            }

            // delete() ini men-trigger cascadeOnDelete() DB untuk semua relasi
            // hasMany/hasOne di atas (inspection_items, videos,
            // estimation_documents, invoice, payment_receipts) — row-nya ikut
            // terhapus otomatis, file fisiknya sudah dibersihkan manual di atas.
            $serviceOrder->delete();
        });

        return redirect()
            ->route('admin.service-orders.index')
            ->with('success', 'Service order berhasil dihapus permanen.');
    }

    private function authorizeAccess(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if (in_array($user->role, ['admin', 'service_advisor'], true)) {
            return;
        }

        abort(403, 'Anda tidak punya akses ke service order ini.');
    }

    private const REVERT_TRANSITIONS = [
        'quality_control' => 'work_in_progress',
        'invoice_preparation' => 'work_in_progress',
        'completed' => 'work_in_progress',
    ];

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
        $updates['finalized_at'] = $stillPending ? null : now();

        $serviceOrder->update($updates);
    }
}