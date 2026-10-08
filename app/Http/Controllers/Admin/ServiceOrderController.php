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
     * Statuses that can be moved manually via updateStatus().
     * Simple guard for now (linear, following the 5 final stages in PROJECT-RULES section 2).
     * TODO (section 7C #4): this is still a basic version — there are no granular
     * rules yet for which role can move from which status to which status, and it
     * doesn't yet handle the branch to `all_rejected_cancelled`.
     */
    private const ALLOWED_TRANSITIONS = [
        'appointment' => ['work_in_progress'],
        'work_in_progress' => ['quality_control', 'all_rejected_cancelled'],
        'quality_control' => ['invoice_preparation'],
        'invoice_preparation' => ['completed'],
    ];

    /**
     * Statuses in which inspection items may be added/edited/deleted/reopened.
     * Extended to include 'appointment' in addition to 'work_in_progress' (owner
     * request: items should be preparable/editable before the order enters work).
     */
    private const ITEM_EDITABLE_STATUSES = [
        ServiceOrder::STATUS_APPOINTMENT,
        ServiceOrder::STATUS_WORK_IN_PROGRESS,
    ];

    public function index(Request $request)
    {
        $vatPercent = (float) \App\Models\Setting::current()->ppn_percent;

        // NOTE: item 'rejected' dikecualikan di sini supaya konsisten dengan
        // InspectionItemPricingService::breakdownByGroup()/itemContribution(),
        // Show.jsx, dan InspectionReport.jsx (lihat PROJECT-RULES.md bagian 1
        // poin 1) — sebelumnya query ini kelewat saat fix itu diterapkan, jadi
        // "Grand Total Estimate" di listing bisa beda dari "Order Totals" di
        // halaman detail order yang sama.
        $estimateSql = "(SELECT COALESCE(SUM(
                (cost_item * (1 - discount_item_percent / 100))
                + (cost_labour * (1 - discount_labour_percent / 100))
            ), 0) * (1 + ? / 100)
            FROM inspection_items
            WHERE inspection_items.service_order_id = service_orders.id
            AND status != 'rejected'
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

        // Akses daftar (FR-035, keputusan owner 2026-10-08): SA hanya melihat order miliknya di
        // Work In Process dan Work Completed; admin melihat semua dan dapat memfilter per SA.
        // Ini hanya membatasi DAFTAR; detail dan aksi order (authorizeAccess) tidak berubah.
        // Untuk SA, parameter `service_advisor_id` dari URL diabaikan (dipaksa ke ID sendiri).
        $user = $request->user();
        $isAdmin = $user->role === 'admin';
        $saId = $isAdmin ? (int) $request->service_advisor_id : (int) $user->id;

        // Menu Work In Process / Work Completed (FR-026, API-011): `group` = in_process (semua
        // status selain completed, termasuk all_rejected_cancelled) atau completed. Nilai lain
        // dianggap in_process. Filter `status` hanya berlaku bila statusnya termasuk group ini,
        // supaya URL yang tidak konsisten tidak menghasilkan daftar kosong tanpa penjelasan.
        $group = $request->query('group') === 'completed' ? 'completed' : 'in_process';
        $statusInGroup = filled($request->status)
            && (($group === 'completed') === ($request->status === ServiceOrder::STATUS_COMPLETED));

        $query
            ->when($group === 'completed',
                fn ($q) => $q->where('service_orders.status', ServiceOrder::STATUS_COMPLETED),
                fn ($q) => $q->where('service_orders.status', '!=', ServiceOrder::STATUS_COMPLETED)
            )
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
            ->when($statusInGroup ? $request->status : null, fn ($q, $status) =>
                $q->where('status', $status)
            )
            ->when($request->items_approval_status, fn ($q, $status) =>
                $q->where('items_approval_status', $status)
            )
            ->when($saId > 0, fn ($q) =>
                $q->where('service_orders.service_advisor_id', $saId)
            )
            // Filter tanggal berdasarkan created_at. Tanggal dari UI (YYYY-MM-DD)
            // diartikan dalam Asia/Jakarta (konvensi project), lalu dikonversi ke
            // timezone aplikasi supaya cocok dengan nilai yang disimpan di DB.
            // 1 tanggal saja = date_from sama dengan date_to; salah satu boleh
            // kosong untuk rentang terbuka. Tanggal tidak valid diabaikan.
            ->when($this->parseFilterDate($request->date_from, 'start'), fn ($q, $from) =>
                $q->where('service_orders.created_at', '>=', $from)
            )
            ->when($this->parseFilterDate($request->date_to, 'end'), fn ($q, $to) =>
                $q->where('service_orders.created_at', '<=', $to)
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
        } elseif ($request->sort_by === 'service_advisor') {
            // Urut berdasarkan nama service advisor via subquery, jadi tidak
            // perlu join dan select('service_orders.*') tetap aman.
            $advisor = (new ServiceOrder)->serviceAdvisor()->getRelated();
            $query->orderBy(
                $advisor->newQuery()
                    ->select('name')
                    ->whereColumn($advisor->getQualifiedKeyName(), 'service_orders.service_advisor_id')
                    ->limit(1),
                $sortDir
            );
        } elseif (in_array($request->sort_by, $directSortColumns, true)) {
            $query->orderBy($request->sort_by, $sortDir);
        } else {
            $query->latest('service_orders.created_at');
        }

        $filters = $request->only([
            'status', 'items_approval_status', 'service_advisor_id',
            'date_from', 'date_to',
            'grand_total_field', 'grand_total_value', 'grand_total_from', 'grand_total_to',
            'sort_by', 'sort_dir',
        ]);

        if (! $statusInGroup) {
            unset($filters['status']);
        }

        // SA tidak memakai filter SA: daftar sudah dipaksa ke ordernya sendiri.
        if (! $isAdmin) {
            unset($filters['service_advisor_id']);
        }

        // Pilihan filter SA (khusus admin): semua SA, ditambah admin yang memegang order
        // (admin bisa membuat order atas namanya sendiri). where() dibungkus (RULE-024).
        $serviceAdvisors = $isAdmin
            ? User::query()
                ->where(fn ($q) => $q
                    ->where('role', 'service_advisor')
                    ->orWhereIn('id', ServiceOrder::query()->select('service_advisor_id')->whereNotNull('service_advisor_id'))
                )
                ->orderBy('name')
                ->get(['id', 'name'])
            : [];

        return Inertia::render('Admin/ServiceOrders/Index', [
            'orders' => $query->paginate(20)->withQueryString(),
            'search' => $request->search,
            'group' => $group,
            'filters' => $filters,
            'serviceAdvisors' => $serviceAdvisors,
        ]);
    }

    /**
     * Parse tanggal filter (YYYY-MM-DD) dari request menjadi batas waktu awal/akhir
     * hari di Asia/Jakarta, dikonversi ke timezone aplikasi. Return null kalau
     * kosong atau formatnya tidak valid.
     */
    private function parseFilterDate(?string $value, string $edge): ?\Illuminate\Support\Carbon
    {
        if (! $value || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        try {
            $date = \Illuminate\Support\Carbon::createFromFormat('Y-m-d', $value, 'Asia/Jakarta');
        } catch (\Throwable) {
            return null;
        }

        if ($date === false) {
            return null;
        }

        $date = $edge === 'end' ? $date->endOfDay() : $date->startOfDay();

        return $date->setTimezone(config('app.timezone'));
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
        // Plat disimpan seragam (huruf besar, tanpa spasi) seperti data impor.
        if ($request->filled('new_vehicle.plate_number')) {
            $request->merge(['new_vehicle' => array_merge($request->input('new_vehicle'), [
                'plate_number' => strtoupper(preg_replace('/\s+/', '', (string) $request->input('new_vehicle.plate_number'))),
            ])]);
        }

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

            'technician_id' => ['required', Rule::exists('users', 'id')->where('role', 'chief_technician')],
            'personal_message' => ['required', 'string'],
            'inspection_fee' => ['required', 'numeric', 'min:0'],
            'inspection_fee_note' => ['nullable', 'string'],

            // Customer complaint/request, entered by the SA when creating the order —
            // still editable during work_in_progress via updateCustomerComplaint(),
            // and locked once it enters quality_control (see
            // ServiceOrder::CUSTOMER_COMPLAINT_EDITABLE_STATUSES).
            'customer_complaint' => ['required', 'string'],

            'inspection_items' => ['required', 'array', 'min:1'],
            'inspection_items.*.name' => ['required', 'string', 'max:255'],
            'inspection_items.*.description' => ['nullable', 'string'],
            'inspection_items.*.cost_item' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.cost_labour' => ['required', 'numeric', 'min:0'],
            'inspection_items.*.discount_item_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.discount_labour_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'inspection_items.*.group' => ['required', Rule::in(InspectionItem::GROUPS)],

            'videos' => ['required', 'array', 'min:1', 'max:1'],
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
            return back()->withErrors(['customer_id' => 'Select an existing customer, or fill in new customer data.']);
        }

        if (!$validated['vehicle_id'] && empty($validated['new_vehicle'])) {
            return back()->withErrors(['vehicle_id' => 'Select an existing vehicle, or fill in new vehicle data.']);
        }

        $serviceOrder = DB::transaction(function () use ($validated, $request) {
            $customerId = $validated['customer_id']
                ?? $this->findOrCreateCustomer($validated['new_customer'])->id;

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
            ->with('success', 'Service order created successfully.');
    }

    /**
     * Upload/replace the single video for an EXISTING service order.
     *
     * Sengaja dibuat TIDAK digate oleh order.status — beda dari
     * uploadEstimationDocument()/uploadInvoice() yang dikunci ke status
     * tertentu. Alasan: fitur ini dibuat khusus untuk memungkinkan SA/admin
     * memperbaiki/mengisi ulang video yang datanya rusak/hilang (kasus
     * migrasi http->https, lihat PROJECT-RULES.md), termasuk untuk WO lama
     * yang sudah 'completed' — jadi tidak masuk akal kalau dibatasi status.
     *
     * Mengikuti pola store-new-lalu-delete-old yang sama dengan
     * uploadEstimationDocument() (PROJECT-RULES.md bagian 1, bug fix urutan
     * upload) — file baru & row DB harus sukses dulu sebelum file lama
     * (kalau ada & video_source='upload') dihapus.
     */
    public function uploadVideo(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $validated = $request->validate([
            'file' => [
                'required',
                'file',
                'mimes:mp4,mov,webm',
                'max:102400',
                new MaxVideoDuration(120),
            ],
        ]);

        DB::transaction(function () use ($validated, $request, $serviceOrder) {
            $existing = $serviceOrder->videos()->first();
            $oldPath = null;
            if ($existing && $existing->video_source === 'upload' && $existing->video_url) {
                $oldPath = str_replace(Storage::disk('public')->url(''), '', $existing->video_url);
            }

            $file = $request->file('file');

            $getID3 = new \getID3();
            $info = $getID3->analyze($file->getRealPath());
            $durationSeconds = isset($info['playtime_seconds'])
                ? (int) round($info['playtime_seconds'])
                : null;

            // Store the new file FIRST — if this fails, the old file remains intact.
            $path = $file->store('service-order-videos', 'public');

            $newAttributes = [
                'video_url' => Storage::disk('public')->url($path),
                'video_source' => 'upload',
                'sort_order' => 0,
                'duration_seconds' => $durationSeconds,
            ];

            if ($existing) {
                $existing->update($newAttributes);
            } else {
                $serviceOrder->videos()->create($newAttributes);
            }

            // Only delete the old physical file AFTER the new file + DB row
            // are confirmed successful.
            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }

            $serviceOrder->touchActivity();
        });

        return back()->with('success', 'Video uploaded successfully.');
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

        // Order-level "Estimated Grand Total" — gabungan semua group, SEMUA
        // item apapun statusnya (termasuk rejected), tidak bergantung
        // approve/reject. Beda tujuan dari breakdownByGroup() (per group,
        // exclude rejected) dan Confirmed Total (grandTotalApproved, dihitung
        // di frontend dari final_price_snapshot item approved). Lihat
        // InspectionItemPricingService::estimatedGrandTotalForOrder().
        $estimatedGrandTotal = $pricingService->estimatedGrandTotalForOrder(
            $serviceOrder->inspectionItems,
            (float) $settings->ppn_percent
        );

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
            'settings' => $settings,
            'groups' => InspectionItem::GROUPS,
            'breakdownByGroup' => $breakdownByGroup,
            'estimatedGrandTotal' => $estimatedGrandTotal,
            // customer_complaint itself is already inside 'order' (a regular
            // model column), but the editability flag is sent separately so
            // Show.jsx doesn't need to duplicate the list of "editable"
            // statuses — a single source of truth stays in
            // ServiceOrder::isCustomerComplaintEditable().
            'customerComplaintEditable' => $serviceOrder->isCustomerComplaintEditable(),
            // Same pattern as above but for inspection_fee — single source
            // of truth in ServiceOrder::isInspectionFeeEditable().
            'inspectionFeeEditable' => $serviceOrder->isInspectionFeeEditable(),
        ]);
    }

    /**
     * Update inspection_fee (& inspection_fee_note) — dipisah dari update
     * lain, pola sama persis dengan updateCustomerComplaint(). Guard
     * backend adalah sumber kebenaran (ServiceOrder::isInspectionFeeEditable()),
     * bukan cuma disabled state di frontend, supaya tetap aman kalau ada
     * request "nyasar" dari tab lama / race condition status berubah.
     */
    public function updateInspectionFee(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if (! $serviceOrder->isInspectionFeeEditable()) {
            return back()->withErrors([
                'inspection_fee' => 'Inspection fee can no longer be edited at this order status.',
            ]);
        }

        $validated = $request->validate([
            'inspection_fee' => ['required', 'numeric', 'min:0'],
            'inspection_fee_note' => ['nullable', 'string'],
        ]);

        $serviceOrder->update([
            'inspection_fee' => $validated['inspection_fee'],
            'inspection_fee_note' => $validated['inspection_fee_note'] ?? null,
        ]);

        $serviceOrder->touchActivity();

        return back()->with('success', 'Inspection fee updated.');
    }

    /**
     * Update the customer_complaint column separately from other updates —
     * used when the SA changes the customer's complaint during
     * appointment/work_in_progress. Locked (rejected by the backend) once the
     * status enters quality_control and beyond, even if the request "makes it"
     * to the server (e.g. an old tab that hasn't been refreshed, or a race
     * condition where the status just changed) — this guard is the final
     * source of truth, not just a disabled button on the frontend.
     */
    public function updateCustomerComplaint(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if (!$serviceOrder->isCustomerComplaintEditable()) {
            return back()->with('error', 'Customer complaint can no longer be changed once the order is in Quality Control.');
        }

        $validated = $request->validate([
            'customer_complaint' => ['required', 'string'],
        ]);

        $serviceOrder->update($validated + ['last_activity_at' => now()]);

        return back()->with('success', 'Customer complaint saved successfully.');
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
            return back()->with('error', "Cannot move status from '{$currentStatus}' to '{$newStatus}'.");
        }

        if ($newStatus === ServiceOrder::STATUS_QUALITY_CONTROL) {
            if (empty($serviceOrder->finalized_at)) {
                return back()->with('error', 'Cannot move to Quality Control yet — the customer has not finished deciding on all inspection items.');
            }
        }

        if ($newStatus === ServiceOrder::STATUS_COMPLETED && !$serviceOrder->hasInvoiceUploaded()) {
            return back()->with('error', 'Upload at least 1 invoice PDF before marking the order as complete.');
        }

        $updates = ['status' => $newStatus, 'last_activity_at' => now()];

        $serviceOrder->update($updates);

        return back()->with('success', 'Status updated successfully.');
    }

    public function revertStatus(Request $request, ServiceOrder $serviceOrder)
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admin can revert order status.');
        }

        $currentStatus = $serviceOrder->status;
        $target = self::REVERT_TRANSITIONS[$currentStatus] ?? null;

        if ($target === null) {
            return back()->with('error', "Status '{$currentStatus}' cannot be reverted.");
        }

        // FIX: previously finalized_at was nulled unconditionally on every
        // revert, even when all items were already approved — as a result the
        // order couldn't move forward to Quality Control again even though
        // there were no items that actually needed to be re-decided. It is now
        // calculated from the items' actual condition, using the same logic as
        // recalculateApprovalStatus().
        $stillPending = $serviceOrder->inspectionItems()
            ->where('status', 'pending')
            ->exists();

        $serviceOrder->update([
            'status' => $target,
            'finalized_at' => $stillPending ? null : now(),
            'last_activity_at' => now(),
        ]);

        return back()->with('success', "Status reverted to {$target}.");
    }

    public function reopenInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'Item can only be reopened while status is Appointment or Work In Process.');
        }

        if ($inspectionItem->status !== 'rejected') {
            return back()->with('error', 'Only items with status Rejected can be reopened.');
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

        return back()->with('success', 'Item reopened successfully, awaiting customer decision.');
    }

    public function storeInspectionItem(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'Item can only be added while status is Appointment or Work In Process.');
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

        return back()->with('success', 'Item added successfully.');
    }

    public function updateInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'Item can only be changed while status is Appointment or Work In Process.');
        }

        // CHANGED: previously approved items were fully blocked (isLocked()).
        // Now they can be edited — but any edit on an approved item
        // automatically reverts it to 'pending' (awaiting a new customer
        // decision), since its price/content has changed from what was
        // originally approved. Rejected items STILL cannot go through here —
        // they must be reopened first, so the SA is aware they're reopening a
        // negotiation, not silently editing it.
        if ($inspectionItem->status === 'rejected') {
            return back()->with('error', 'A rejected item must be reopened before it can be edited.');
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

        DB::transaction(function () use ($validated, $inspectionItem, $serviceOrder, $request) {
            $wasApproved = $inspectionItem->status === 'approved';

            $updates = [
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'cost_item' => $validated['cost_item'],
                'cost_labour' => $validated['cost_labour'],
                'discount_item_percent' => $validated['discount_item_percent'] ?? 0,
                'discount_labour_percent' => $validated['discount_labour_percent'] ?? 0,
                'group' => $validated['group'],
            ];

            if ($wasApproved) {
                $updates['status'] = 'pending';
                $updates['decided_at'] = null;
                $updates['final_price_snapshot'] = null;

                $inspectionItem->logs()->create([
                    'old_status' => 'approved',
                    'new_status' => 'pending',
                    'actor_type' => 'staff',
                    'actor_id' => $request->user()->id,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);
            }

            $inspectionItem->update($updates);

            // FIX: previously recalculateApprovalStatus() was only called if
            // !$wasRejected — but rejected items are now already blocked above
            // (they never reach this point), so call it always, unconditionally.
            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item updated successfully.');
    }

    public function destroyInspectionItem(Request $request, ServiceOrder $serviceOrder, InspectionItem $inspectionItem)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($inspectionItem->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'Item can only be deleted while status is Appointment or Work In Process.');
        }

        if ($inspectionItem->isLocked()) {
            return back()->with('error', 'An item already approved by the customer (approved) cannot be deleted.');
        }

        if ($serviceOrder->inspectionItems()->count() <= 1) {
            return back()->with('error', 'The order must have at least 1 inspection item.');
        }

        DB::transaction(function () use ($inspectionItem, $serviceOrder) {
            $inspectionItem->delete();
            $this->recalculateApprovalStatus($serviceOrder);
        });

        return back()->with('success', 'Item deleted successfully.');
    } 

    public function uploadEstimationDocument(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'The estimation form can only be changed while status is Appointment or Work In Process.');
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

            // Store the new file FIRST — if this fails, the old file remains intact.
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

            // Only delete the old file AFTER the new file + DB row are confirmed successful.
            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }

            $serviceOrder->touchActivity();
        });

        return back()->with('success', 'Estimation form uploaded successfully.');
    }

    public function deleteEstimationDocument(Request $request, ServiceOrder $serviceOrder, ServiceOrderEstimationDocument $estimationDocument)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($estimationDocument->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if (!in_array($serviceOrder->status, self::ITEM_EDITABLE_STATUSES, true)) {
            return back()->with('error', 'The estimation form can only be deleted while status is Appointment or Work In Process.');
        }

        if ($estimationDocument->pdf_path) {
            Storage::disk('public')->delete($estimationDocument->pdf_path);
        }

        $estimationDocument->delete();
        $serviceOrder->touchActivity();

        return back()->with('success', 'Estimation form deleted successfully.');
    }

    public function uploadInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

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

            $serviceOrder->touchActivity();
        });

        return back()->with('success', 'Invoice PDF uploaded successfully.');
    }

    public function deleteInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $invoice = $serviceOrder->invoice;

        if (!$invoice) {
            return back()->with('error', 'There is no invoice to delete.');
        }

        Storage::disk('public')->delete($invoice->file_path);
        $invoice->delete();
        $serviceOrder->touchActivity();

        return back()->with('success', 'Invoice PDF deleted successfully.');
    }

    public function updatePaymentDetails(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($serviceOrder->status !== ServiceOrder::STATUS_INVOICE_PREPARATION) {
            return back()->with('error', 'Payment details can only be changed while status is Invoice Preparation.');
        }

        $validated = $request->validate([
            'invoice_number' => ['nullable', 'string', 'max:255'],
            'bill_to' => ['nullable', 'string', 'max:255'],
        ]);

        $serviceOrder->update($validated + ['last_activity_at' => now()]);

        return back()->with('success', 'Payment details saved successfully.');
    }

    public function uploadStaffPaymentReceipt(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

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

            // Tidak eksplisit disebut di daftar PROJECT-RULES.md 12.4 poin 2,
            // tapi bukti bayar staff juga tampil di halaman ini — disertakan
            // di sini supaya audit titik perubahan benar-benar menyeluruh.
            $serviceOrder->touchActivity();
        });

        return back()->with('success', 'Receipt uploaded successfully.');
    }

    public function deleteStaffPaymentReceipt(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $receipt = $serviceOrder->staffPaymentReceipt;

        if (!$receipt) {
            return back()->with('error', 'There is no receipt to delete.');
        }

        Storage::disk('public')->delete($receipt->file_path);
        $receipt->delete();
        $serviceOrder->touchActivity();

        return back()->with('success', 'Receipt deleted successfully.');
    }

    /**
     * Hard delete service order — ONLY admin, applies to ALL statuses
     * including 'completed' (owner's decision, mainly for cleaning up
     * dummy/testing WOs after going live on hosting). Child rows (inspection
     * items, videos, estimation documents, invoice, payment receipts) are
     * deleted along with it via cascadeOnDelete() in each migration — BUT the
     * physical files in storage are NOT automatically removed by the DB
     * cascade, so they must be cleaned up manually here BEFORE
     * $serviceOrder->delete() is called.
     *
     * There is INTENTIONALLY NO status guard here — the order can still be
     * deleted even if the customer has already approved/rejected items, is
     * already completed, etc. This is DESTRUCTIVE and PERMANENT, there is no
     * soft delete/recovery. Explicit confirmation on the frontend (AlertDialog)
     * is required before calling this endpoint.
     */
    public function destroy(Request $request, ServiceOrder $serviceOrder)
    {
        if ($request->user()->role !== 'admin') {
            abort(403, 'Only admin can delete a service order.');
        }

        // Kembali ke daftar tempat order ini berada (Work In Process / Work Completed).
        $redirectGroup = $serviceOrder->status === ServiceOrder::STATUS_COMPLETED ? 'completed' : 'in_process';

        $serviceOrder->load([
            'videos',
            'estimationDocuments',
            'invoice',
            'customerPaymentReceipt',
            'staffPaymentReceipt',
        ]);

        DB::transaction(function () use ($serviceOrder) {
            // Locally uploaded videos (video_source = 'upload') have a physical
            // file on the 'public' disk. 'external_link' videos (e.g. YouTube)
            // have no file to delete — their video_url is just an external URL string.
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

            // This delete() triggers the DB cascadeOnDelete() for all
            // hasMany/hasOne relations above (inspection_items, videos,
            // estimation_documents, invoice, payment_receipts) — their rows are
            // automatically deleted along with it, and the physical files have
            // already been cleaned up manually above.
            $serviceOrder->delete();
        });

        return redirect()
            ->route('admin.service-orders.index', ['group' => $redirectGroup])
            ->with('success', 'Service order permanently deleted.');
    }

    /**
     * Endpoint super ringan untuk polling + change-detection sisi admin
     * (PROJECT-RULES.md bagian 12.4 poin 3) — HANYA mengembalikan
     * last_activity_at, bukan data order lengkap. Dipanggil dari
     * Admin/ServiceOrders/Show.jsx tiap beberapa detik selama tab aktif.
     * Rate-limit dipasang di routes/web.php (throttle), bukan di sini.
     */
    public function lastActivity(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        return response()->json([
            'last_activity_at' => optional($serviceOrder->last_activity_at)->toJSON(),
        ]);
    }

    private function authorizeAccess(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if (in_array($user->role, ['admin', 'service_advisor'], true)) {
            return;
        }

        abort(403, 'You do not have access to this service order.');
    }

    private const REVERT_TRANSITIONS = [
        'quality_control' => 'work_in_progress',
        'invoice_preparation' => 'work_in_progress',
        'completed' => 'work_in_progress',
    ];

    private function recalculateApprovalStatus(ServiceOrder $serviceOrder): void
    {
        $freshItems = $serviceOrder->inspectionItems()->get();

        // Dipanggil dari storeInspectionItem/updateInspectionItem/
        // destroyInspectionItem/reopenInspectionItem — jadi last_activity_at
        // disertakan di sini sekali saja (bukan diulang manual di tiap
        // pemanggil) supaya keempat aksi itu otomatis ter-cover untuk
        // polling + change-detection (PROJECT-RULES.md bagian 12.4).
        $serviceOrder->update([
            'items_approval_status' => ServiceOrder::computeApprovalStatus($freshItems),
            'finalized_at' => ServiceOrder::hasPendingItems($freshItems) ? null : now(),
            'last_activity_at' => now(),
        ]);
    }

    /**
     * Pakai customer yang sudah ada kalau nama (abaikan huruf besar/kecil dan
     * spasi tepi) DAN nomor telepon (hanya digit) sama — mencegah duplikat
     * dari form "New Customer" di Create.
     */
    private function findOrCreateCustomer(array $data): Customer
    {
        $digits = self::canonicalPhone($data['phone']);

        $existing = Customer::whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($data['name']))])
            ->get()
            ->first(fn ($c) => self::canonicalPhone($c->phone) === $digits);

        return $existing ?? Customer::create($data);
    }

    /**
     * Bentuk kanonik nomor telepon (sama dengan toLocalDigits di Customers/Index.jsx):
     * hanya digit, tanpa awalan 62 atau 0 — supaya "0812…", "+62 812…", dan "812…" dianggap sama.
     */
    private static function canonicalPhone(?string $raw): string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw);
        if (str_starts_with($digits, '62')) {
            return substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
    }
}