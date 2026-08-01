<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\ServiceOrder;
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
        'scheduled' => ['in_progress'],
        'in_progress' => ['quality_control', 'all_rejected_cancelled'],
        'quality_control' => ['follow_up'],
        'follow_up' => ['completed'],
    ];

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
            'inspection_items.*.is_urgent' => ['boolean'],

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
                'status' => 'scheduled',
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
                    'is_urgent' => $item['is_urgent'] ?? false,
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

        // Relasi 'invoice' dihapus — model & tabel Invoice sudah di-drop total
        // (bagian 2). Data invoice sekarang kolom langsung di service_orders
        // (invoice_pdf_path, invoice_uploaded_at, invoice_uploaded_by).
        // invoiceUploadedBy sengaja di-eager-load supaya nama SA yang upload
        // bisa ditampilkan di Show.jsx tanpa N+1 query tambahan.
        $serviceOrder->load([
            'vehicle.customer',
            'serviceAdvisor',
            'technician',
            'videos',
            'inspectionItems',
            'invoiceUploadedBy',
        ]);

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
            // Dibutuhkan Show.jsx untuk breakdown PPN (Subtotal/PPN/Grand Total)
            // di kartu Inspection Items — settings.ppn_percent sumber kebenaran
            // tunggal, sama seperti dipakai InspectionItemPricingService di backend.
            'settings' => Setting::current(),
        ]);
    }

    public function updateStatus(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        $validated = $request->validate([
            'status' => ['required', Rule::in([
                'scheduled', 'in_progress', 'quality_control', 'follow_up',
                'completed', 'all_rejected_cancelled',
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
        if ($newStatus === 'quality_control' && empty($serviceOrder->finalized_at)) {
            return back()->with('error', 'Belum bisa pindah ke Quality Control — customer belum selesai memutuskan semua item inspeksi.');
        }

        // Aturan wajib bagian 2: tidak boleh masuk 'completed' kalau
        // invoice_pdf_path masih kosong (invoice diupload manual oleh SA).
        if ($newStatus === 'completed' && empty($serviceOrder->invoice_pdf_path)) {
            return back()->with('error', 'Upload invoice PDF dulu sebelum menandai order selesai.');
        }

        $updates = ['status' => $newStatus];

        $serviceOrder->update($updates);

        return back()->with('success', 'Status berhasil diperbarui.');
    }

    public function uploadInvoice(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Invoice hanya masuk akal diupload setelah quality_control (sesuai
        // PROJECT-RULES bagian 6, tahap 3: "Siapkan invoice (upload PDF oleh SA)").
        // Guard longgar dulu: boleh selama belum 'completed', supaya SA masih bisa
        // ganti file kalau salah upload sebelum order ditutup.
        if ($serviceOrder->status === ServiceOrder::STATUS_COMPLETED) {
            return back()->with('error', 'Order sudah completed, invoice tidak bisa diganti lagi.');
        }

        $validated = $request->validate([
            'invoice_pdf' => ['required', 'file', 'mimes:pdf', 'max:10240'], // max 10MB
        ]);

        // Hapus file lama kalau ada re-upload, biar storage tidak menumpuk
        if ($serviceOrder->invoice_pdf_path) {
            Storage::disk('public')->delete($serviceOrder->invoice_pdf_path);
        }

        $path = $request->file('invoice_pdf')->store('invoices', 'public');

        $serviceOrder->update([
            'invoice_pdf_path' => $path,
            'invoice_uploaded_at' => now(),
            'invoice_uploaded_by' => $request->user()->id,
        ]);

        return back()->with('success', 'Invoice PDF berhasil diupload.');
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