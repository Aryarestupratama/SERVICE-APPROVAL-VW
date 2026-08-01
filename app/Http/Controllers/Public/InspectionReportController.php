<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Models\Setting;
use App\Services\InspectionItemPricingService;
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

        // Halaman publik mengasumsikan settings sudah pasti ada (bukan seperti
        // Admin\SettingController::edit() yang harus toleran terhadap tabel
        // masih kosong) — lihat PROJECT-RULES.md bagian 4.
        $settings = Setting::current();

        // Section viewer PDF invoice (bagian 5, revisi 2026-07-31) hanya
        // muncul mulai status quality_control/completed.
        $showInvoiceViewer = in_array($serviceOrder->status, ['quality_control', 'completed'], true);

        return Inertia::render('Public/InspectionReport', [
            'token' => $token,
            'settings' => [
                'workshop_name' => $settings->workshop_name,
                'logo_path' => $settings->logo_path,
                'address' => $settings->address,
                'phone' => $settings->phone,
                'whatsapp_number' => $settings->whatsapp_number,
                'google_maps_url' => $settings->google_maps_url,
                'ppn_percent' => (float) $settings->ppn_percent,
            ],
            'order' => [
                'id' => $serviceOrder->id,
                'status' => $serviceOrder->status,
                'items_approval_status' => $serviceOrder->items_approval_status,
                'personal_message' => $serviceOrder->personal_message,
                'inspection_fee' => (float) $serviceOrder->inspection_fee,
                'inspection_fee_note' => $serviceOrder->inspection_fee_note,
                'invoice_pdf_path' => $showInvoiceViewer ? $serviceOrder->invoice_pdf_path : null,
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
                'cost_item' => (float) $item->cost_item,
                'cost_labour' => (float) $item->cost_labour,
                'discount_item_percent' => (float) $item->discount_item_percent,
                'discount_labour_percent' => (float) $item->discount_labour_percent,
                'final_price_snapshot' => $item->final_price_snapshot !== null
                    ? (float) $item->final_price_snapshot
                    : null,
                'is_urgent' => $item->is_urgent,
                'status' => $item->status,
            ]),
        ]);
    }

    /**
     * Terima keputusan approve/reject untuk item-item yang MASIH PENDING, dari
     * modal konfirmasi final. Bisa dipanggil berkali-kali (negosiasi berulang)
     * selama status order masih 'in_progress' dan masih ada item pending.
     *
     * Item yang sudah 'approved' terkunci permanen (final_price_snapshot locked,
     * PROJECT-RULES.md bagian 2 & 7B) — tidak bisa didecide ulang. Item 'rejected'
     * saat ini juga final di controller ini; kalau nanti SA butuh membuka lagi
     * item yang ditolak untuk negosiasi ulang (reset ke pending dengan harga
     * baru), itu fitur terpisah yang BELUM ADA — lihat catatan TODO di bawah.
     */
    public function submitDecisions(Request $request, string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)
            ->with('inspectionItems')
            ->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            abort(410, 'This link has expired.');
        }

        // Approval item terjadi di dalam tahap 'in_progress' (PROJECT-RULES.md
        // bagian 2: "Vehicle Check-in & Work Process, termasuk approval item
        // customer... semua di tahap ini"). Order TETAP di 'in_progress' selama
        // negosiasi berjalan — tidak auto-pindah tahap, SA yang memutuskan kapan
        // lanjut ke quality_control lewat ServiceOrderController::updateStatus().
        if ($serviceOrder->status !== 'in_progress') {
            abort(409, 'This inspection report is not open for decisions.');
        }

        $pendingItems = $serviceOrder->inspectionItems->where('status', 'pending');

        // Tidak ada lagi item pending untuk order ini — negosiasi sudah final
        // sebelumnya (lihat finalized_at), tidak ada yang bisa didecide lagi
        // sampai SA membuka ulang item tertentu (fitur belum ada).
        if ($pendingItems->isEmpty()) {
            abort(409, 'This inspection report has already been decided.');
        }

        $validated = $request->validate([
            'decisions' => ['required', 'array', 'min:1'],
            'decisions.*.id' => ['required', 'integer'],
            'decisions.*.status' => ['required', 'in:approved,rejected'],
        ]);

        $pendingItemsById = $pendingItems->keyBy('id');

        $submittedIds = collect($validated['decisions'])->pluck('id')->sort()->values()->toArray();
        $expectedIds = $pendingItemsById->keys()->sort()->values()->toArray();

        // Payload boleh berisi SEBAGIAN dari item pending (negosiasi bertahap) —
        // yang penting semua id yang dikirim memang benar-benar masih pending.
        // Duplikat id juga ditolak.
        if (count($submittedIds) !== count(array_unique($submittedIds))) {
            abort(422, 'Duplicate item ids in submission.');
        }

        $invalidIds = array_diff($submittedIds, $expectedIds);
        if (!empty($invalidIds)) {
            abort(422, 'Some submitted items are not currently pending for this order.');
        }

        DB::transaction(function () use ($validated, $pendingItemsById, $request, $serviceOrder) {
            $pricingService = new InspectionItemPricingService();

            foreach ($validated['decisions'] as $decision) {
                $item = $pendingItemsById[$decision['id']];
                $oldStatus = $item->status;
                $newStatus = $decision['status'];

                $item->update([
                    'status' => $newStatus,
                    'decided_at' => now(),
                ]);

                // Diskon & harga final locked mulai di sini — snapshot dihitung
                // pakai ppn_percent yang berlaku SAAT INI, tidak pernah dihitung
                // ulang setelahnya (PROJECT-RULES.md bagian 2 & 7B).
                if ($newStatus === 'approved') {
                    $pricingService->lockFinalPrice($item->fresh());
                }

                $item->logs()->create([
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                    'actor_type' => 'customer',
                    'actor_id' => null,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);
            }

            $freshItems = $serviceOrder->inspectionItems()->get();
            $stillPending = $freshItems->contains(fn ($item) => $item->status === 'pending');
            $allRejected = $freshItems->every(fn ($item) => $item->status === 'rejected');
            $allApproved = $freshItems->every(fn ($item) => $item->status === 'approved');

            $itemsApprovalStatus = match (true) {
                $allRejected => 'rejected',
                $allApproved => 'approved',
                default => 'partially_approved',
            };

            $updates = ['items_approval_status' => $itemsApprovalStatus];

            // Negosiasi baru dianggap final kalau tidak ada item pending tersisa.
            // Selama masih ada yang pending (skenario reopen item di masa depan),
            // finalized_at belum di-set — customer masih bisa submit lagi nanti.
            if (!$stillPending) {
                $updates['finalized_at'] = now();

                // Satu-satunya transisi status utama yang otomatis di sini:
                // kalau benar-benar semua item ditolak, order dibatalkan.
                // Selain itu (approved semua/sebagian), status TETAP 'in_progress'
                // — SA yang lanjutkan manual ke quality_control kapan siap.
                if ($allRejected) {
                    $updates['status'] = 'all_rejected_cancelled';
                }
            }

            $serviceOrder->update($updates);
        });

        return back()->with('success', 'Your decisions have been submitted.');
    }
}