<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class InspectionReportController extends Controller
{
    public function show(string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)
            ->with(['vehicle.customer', 'serviceAdvisor', 'videos', 'inspectionItems'])
            ->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            return Inertia::render('Public/LinkExpired');
        }

        $settings = Setting::first();

        return Inertia::render('Public/InspectionReport', [
            'token' => $token,
            'settings' => [
                'workshop_name' => $settings?->workshop_name,
                'logo_path' => $settings?->logo_path,
                'address' => $settings?->address,
                'phone' => $settings?->phone,
                'whatsapp_number' => $settings?->whatsapp_number,
                'google_maps_url' => $settings?->google_maps_url,
            ],
            'order' => [
                'id' => $serviceOrder->id,
                'status' => $serviceOrder->status,
                'personal_message' => $serviceOrder->personal_message,
                'inspection_fee' => $serviceOrder->inspection_fee,
                'inspection_fee_note' => $serviceOrder->inspection_fee_note,
            ],
            'vehicle' => [
                'plate_number' => $serviceOrder->vehicle->plate_number,
                'brand' => $serviceOrder->vehicle->brand,
                'model' => $serviceOrder->vehicle->model,
            ],
            'customer' => [
                'name' => $serviceOrder->vehicle->customer->name,
            ],
            'serviceAdvisor' => [
                'name' => $serviceOrder->serviceAdvisor->name,
                'email' => $serviceOrder->serviceAdvisor->email,
                'phone' => $serviceOrder->serviceAdvisor->phone,
            ],
            'videos' => $serviceOrder->videos->map(fn ($video) => [
                'id' => $video->id,
                'video_url' => $video->video_url,
                'label' => 'Part ' . ($video->sort_order + 1),
            ]),
            'items' => $serviceOrder->inspectionItems->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'description' => $item->description,
                'cost' => (float) $item->cost,
                'is_urgent' => $item->is_urgent,
                'status' => $item->status,
            ]),
        ]);
    }

    /**
     * Terima keputusan approve/reject sekaligus untuk semua item, dari modal konfirmasi final.
     * Menulis log per item ke inspection_item_logs, lalu update status service_order otomatis.
     */
    public function submitDecisions(Request $request, string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)
            ->with('inspectionItems')
            ->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            abort(410, 'This link has expired.');
        }

        // Cegah submit ulang kalau order sudah diputuskan sebelumnya
        // (mis. customer refresh & submit dua kali, atau buka link lama setelah status berubah)
        if (!in_array($serviceOrder->status, ['draft', 'sent', 'awaiting_approval'])) {
            abort(409, 'This inspection report has already been decided.');
        }

        $validated = $request->validate([
            'decisions' => ['required', 'array', 'min:1'],
            'decisions.*.id' => ['required', 'integer'],
            'decisions.*.status' => ['required', 'in:approved,rejected'],
        ]);

        $itemsById = $serviceOrder->inspectionItems->keyBy('id');

        // Pastikan semua item milik order ini benar-benar ada di payload —
        // jangan biarkan submit parsial (menghindari status order jadi tanggung)
        $submittedIds = collect($validated['decisions'])->pluck('id')->sort()->values()->toArray();
        $expectedIds = $itemsById->keys()->sort()->values()->toArray();

        if ($submittedIds !== $expectedIds) {
            abort(422, 'All inspection items must be decided before submitting.');
        }

        DB::transaction(function () use ($validated, $itemsById, $request, $serviceOrder) {
            foreach ($validated['decisions'] as $decision) {
                $item = $itemsById[$decision['id']];
                $oldStatus = $item->status;
                $newStatus = $decision['status'];

                $item->update([
                    'status' => $newStatus,
                    'decided_at' => now(),
                ]);

                $item->logs()->create([
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                    'actor_type' => 'customer',
                    'actor_id' => null,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);
            }

            // Logic status otomatis
            $freshItems = $serviceOrder->inspectionItems()->get();
            $allRejected = $freshItems->every(fn ($item) => $item->status === 'rejected');

            $serviceOrder->update([
                'status' => $allRejected ? 'all_rejected_cancelled' : 'approved',
                'finalized_at' => now(),
            ]);

            // TODO: auto-generate invoice jasa inspeksi kalau $allRejected === true
            // Ditunda sampai format invoice_number final (lihat TODO di PROJECT-RULES.md)
        });

        return back()->with('success', 'Your decisions have been submitted.');
    }
}