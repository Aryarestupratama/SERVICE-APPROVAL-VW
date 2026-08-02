<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\InspectionItem;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderEstimationDocument;
use App\Models\ServiceOrderInvoice;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Setting;
use App\Services\WorkOrderNumberGenerator;
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

    /**
     * Batas maksimal jumlah invoice PDF per order — sesuai PROJECT-RULES
     * Revisi Besar #2 poin 8 ("bisa lebih dari 1 file, tergantung permintaan
     * customer, misal dipecah per part"). Tidak ada batas eksplisit di dokumen,
     * dipatok longgar mengikuti pola yang sama dengan estimation form (5 dokumen).
     */
    private const MAX_INVOICES_PER_ORDER = 5;

    public function index(Request $request)
    {
        $user = $request->user();

        $query = ServiceOrder::with(['vehicle.customer', 'serviceAdvisor']);

        if ($user->role === 'service_advisor') {
            $query->where('service_advisor_id', $user->id);
        }

        return Inertia::render('Admin/ServiceOrders/Index', [
            'orders' => $query->latest()->paginate(20),
        ]);
    }

    public function create()
    {
        return Inertia::render('Admin/ServiceOrders/Create', [
            'customers' => Customer::select('id', 'name', 'phone')->orderBy('name')->get(),
            'vehicles' => Vehicle::select('id', 'customer_id', 'plate_number', 'brand', 'model', 'year')
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

            $vehicleId = $validated['vehicle_id']
                ?? Vehicle::create([
                    ...$validated['new_vehicle'],
                    'customer_id' => $customerId,
                ])->id;

            $order = ServiceOrder::create([
                'vehicle_id' => $vehicleId,
                'service_advisor_id' => $request->user()->id,
                'technician_id' => $validated['technician_id'] ?? null,
                // TODO (bagian 7C #3): work_order_number SEHARUSNYA dari
                // App\Services\WorkOrderNumberGenerator (atomic, race-safe) —
                // service class-nya belum dibuat. Ini placeholder sementara
                // SUPAYA TIDAK CRASH, TAPI RAWAN RACE CONDITION kalau 2 SA
                // submit order bersamaan. Ganti begitu service class jadi.
                'work_order_number' => app(WorkOrderNumberGenerator::class)->generate(),
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

    public function show(Request $request, ServiceOrder $serviceOrder)
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
            'invoices.uploadedBy',
            'estimationDocuments.uploadedBy',
        ]);

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
            // Dibutuhkan Show.jsx untuk breakdown PPN (Subtotal/PPN/Grand Total)
            // di kartu Inspection Items — settings.ppn_percent sumber kebenaran
            // tunggal, sama seperti dipakai InspectionItemPricingService di backend.
            'settings' => Setting::current(),
            'groups' => InspectionItem::GROUPS,
            'maxInvoices' => self::MAX_INVOICES_PER_ORDER,
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
     * Upload satu atau lebih file invoice PDF sekaligus — APPEND ke daftar yang
     * sudah ada, bukan replace (beda dari perilaku lama saat masih single-file).
     * Untuk mengganti/menghapus satu file tertentu, pakai deleteInvoice().
     */
    public function uploadInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Guard longgar dulu: boleh selama belum 'completed', supaya SA masih
        // bisa menambah/mengganti invoice sebelum order ditutup.
        if ($serviceOrder->status === ServiceOrder::STATUS_COMPLETED) {
            return back()->with('error', 'Order sudah completed, invoice tidak bisa diubah lagi.');
        }

        $existingCount = $serviceOrder->invoices()->count();

        $validated = $request->validate([
            'invoice_pdfs' => ['required', 'array', 'min:1'],
            'invoice_pdfs.*' => [
                'file',
                'mimes:pdf',
                'max:10240', // max 10MB per file
            ],
        ]);

        $incomingCount = count($validated['invoice_pdfs']);
        if ($existingCount + $incomingCount > self::MAX_INVOICES_PER_ORDER) {
            return back()->with(
                'error',
                'Maksimal ' . self::MAX_INVOICES_PER_ORDER . ' invoice PDF per order. Saat ini sudah ada ' . $existingCount . '.'
            );
        }

        DB::transaction(function () use ($request, $serviceOrder, $existingCount) {
            foreach ($request->file('invoice_pdfs') as $index => $file) {
                $path = $file->store('invoices', 'public');

                $serviceOrder->invoices()->create([
                    'file_path' => $path,
                    'sort_order' => $existingCount + $index,
                    'uploaded_at' => now(),
                    'uploaded_by' => $request->user()->id,
                ]);
            }
        });

        return back()->with('success', 'Invoice PDF berhasil diupload.');
    }

    /**
     * Hapus satu baris invoice tertentu. sort_order baris-baris yang tersisa
     * TIDAK di-reindex otomatis — labelnya ("Invoice 1", dst) memang boleh ada
     * gap, konsisten dengan pola ServiceOrderVideo yang juga tidak reindex.
     */
    public function deleteInvoice(Request $request, ServiceOrder $serviceOrder, ServiceOrderInvoice $invoice)
    {
        $this->authorizeAccess($request, $serviceOrder);

        if ($invoice->service_order_id !== $serviceOrder->id) {
            abort(404);
        }

        if ($serviceOrder->status === ServiceOrder::STATUS_COMPLETED) {
            return back()->with('error', 'Order sudah completed, invoice tidak bisa dihapus lagi.');
        }

        Storage::disk('public')->delete($invoice->file_path);
        $invoice->delete();

        return back()->with('success', 'Invoice PDF berhasil dihapus.');
    }

    /**
     * Cek SA/teknisi hanya bisa akses order miliknya sendiri.
     * Admin selalu lolos.
     */
    private function authorizeAccess(Request $request, ServiceOrder $serviceOrder): void
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            return;
        }

        if ($user->role === 'service_advisor' && $serviceOrder->service_advisor_id === $user->id) {
            return;
        }

        abort(403, 'Anda tidak punya akses ke service order ini.');
    }
}