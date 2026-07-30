<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class ServiceOrderController extends Controller
{
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
            'technicians' => User::where('role', 'technician')
                ->select('id', 'name')
                ->orderBy('name')
                ->get(),
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
            'new_vehicle.brand' => ['nullable', 'string', 'max:100'],
            'new_vehicle.model' => ['required_with:new_vehicle', 'string', 'max:100'],
            'new_vehicle.year' => ['nullable', 'integer', 'min:1980', 'max:' . (date('Y') + 1)],

            'technician_id' => ['nullable', 'exists:users,id'],
            'personal_message' => ['nullable', 'string'],
            'inspection_fee' => ['required', 'numeric', 'min:0'],
            'inspection_fee_note' => ['nullable', 'string'],

            'inspection_items' => ['required', 'array', 'min:1'],
            'inspection_items.*.name' => ['required', 'string', 'max:255'],
            'inspection_items.*.description' => ['nullable', 'string'],
            'inspection_items.*.cost' => ['required', 'numeric', 'min:0'],
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
                'status' => 'draft',
                'inspection_fee' => $validated['inspection_fee'],
                'inspection_fee_note' => $validated['inspection_fee_note'] ?? null,
                'personal_message' => $validated['personal_message'] ?? null,
            ]);

            foreach ($validated['inspection_items'] as $item) {
                $order->inspectionItems()->create([
                    'name' => $item['name'],
                    'description' => $item['description'] ?? null,
                    'cost' => $item['cost'],
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

        $serviceOrder->load(['vehicle.customer', 'serviceAdvisor', 'technician', 'videos', 'inspectionItems', 'invoice']);

        return Inertia::render('Admin/ServiceOrders/Show', [
            'order' => $serviceOrder,
        ]);
    }

    public function updateStatus(Request $request, ServiceOrder $serviceOrder)
    {
        $this->authorizeAccess($request, $serviceOrder);

        // Hanya admin & SA yang bisa sampai sini (dijamin middleware route),
        // teknisi tidak punya akun login jadi tidak perlu cabang logic terpisah
        $validated = $request->validate([
            'status' => ['required', Rule::in([
                'approved', 'in_progress', 'completed', 'invoiced',
            ])],
        ]);

        $serviceOrder->update(['status' => $validated['status']]);

        return back()->with('success', 'Status berhasil diperbarui.');
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