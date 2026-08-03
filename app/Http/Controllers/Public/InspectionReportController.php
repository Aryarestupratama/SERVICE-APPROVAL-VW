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
            ->with(['vehicle.customer', 'serviceAdvisor', 'videos', 'inspectionItems', 'invoices', 'estimationDocuments'])
            ->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            return Inertia::render('Public/LinkExpired');
        }

        $settings = Setting::current();

        // Section "Estimation Form" vs "Invoice Form" dinamis berdasarkan status
        // (PROJECT-RULES.md bagian 5) — hanya salah satu yang aktif di satu waktu,
        // bukan 2 section terpisah selamanya.
        $showEstimationViewer = $serviceOrder->status === ServiceOrder::STATUS_WORK_IN_PROGRESS;

        $showInvoiceViewer = in_array($serviceOrder->status, [
            ServiceOrder::STATUS_QUALITY_CONTROL,
            ServiceOrder::STATUS_INVOICE_PREPARATION,
            ServiceOrder::STATUS_COMPLETED,
        ], true);

        return Inertia::render('Public/InspectionReport', [
            'token' => $token,
            'settings' => [
                'workshop_name' => $settings->workshop_name,
                'logo_path' => $settings->logo_path,
                'hero_image_path' => $settings->hero_image_path,
                'address' => $settings->address,
                'phone' => $settings->phone,
                'google_maps_url' => $settings->google_maps_url,
                'google_maps_embed_url' => $settings->google_maps_embed_url,
                'website_url' => $settings->website_url,
                'ppn_percent' => (float) $settings->ppn_percent,

                // Thank You section (Revisi Besar #2, poin 9) — hanya dipakai
                // JSX saat order.status === 'completed', tapi dikirim selalu
                // supaya controller tidak perlu tahu logika kondisional ini.
                'era_phone' => $settings->era_phone,
                'booking_whatsapp_phone' => $settings->booking_whatsapp_phone,
                'survey_form_url' => $settings->survey_form_url,
            ],
            'order' => [
                'id' => $serviceOrder->id,
                'status' => $serviceOrder->status,
                'items_approval_status' => $serviceOrder->items_approval_status,
                'personal_message' => $serviceOrder->personal_message,
                'inspection_fee' => (float) $serviceOrder->inspection_fee,
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
                'cost_item' => (float) $item->cost_item,
                'cost_labour' => (float) $item->cost_labour,
                'discount_item_percent' => (float) $item->discount_item_percent,
                'discount_labour_percent' => (float) $item->discount_labour_percent,
                'final_price_snapshot' => $item->final_price_snapshot !== null
                    ? (float) $item->final_price_snapshot
                    : null,
                'group' => $item->group,
                'status' => $item->status,
            ]),
            // Invoice bisa lebih dari 1 file — kosong kalau belum masuk status yang
            // relevan, supaya frontend tidak perlu tahu logika status.
            'invoices' => $showInvoiceViewer
                ? $serviceOrder->invoices->map(fn ($invoice) => [
                    'id' => $invoice->id,
                    'file_path' => $invoice->file_path,
                    'label' => $invoice->label,
                ])
                : [],
            // Estimation form per kelompok — hanya kirim yang benar-benar sudah
            // ada file-nya (pdf_path terisi), dan hanya saat work_in_progress.
            'estimationDocuments' => $showEstimationViewer
                ? $serviceOrder->estimationDocuments
                    ->filter(fn ($doc) => !empty($doc->pdf_path))
                    ->map(fn ($doc) => [
                        'id' => $doc->id,
                        'group' => $doc->group,
                        'pdf_path' => $doc->pdf_path,
                    ])
                    ->values()
                : [],
        ]);
    }

    /**
     * Terima keputusan approve/reject untuk item-item yang MASIH PENDING, dari
     * modal konfirmasi final. Bisa dipanggil berkali-kali (negosiasi berulang)
     * selama status order masih 'work_in_progress' dan masih ada item pending.
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

        // Approval item terjadi di dalam tahap 'work_in_progress' (PROJECT-RULES.md
        // bagian 2: "Vehicle Check-in & Work Process, termasuk approval item
        // customer... semua di tahap ini"). Order TETAP di 'work_in_progress' selama
        // negosiasi berjalan — tidak auto-pindah tahap, SA yang memutuskan kapan
        // lanjut ke quality_control lewat ServiceOrderController::updateStatus().
        if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
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
                // Selain itu (approved semua/sebagian), status TETAP 'work_in_progress'
                // — SA yang lanjutkan manual ke quality_control kapan siap.
                if ($allRejected) {
                    $updates['status'] = ServiceOrder::STATUS_ALL_REJECTED_CANCELLED;
                }
            }

            $serviceOrder->update($updates);
        });

        return back()->with('success', 'Your decisions have been submitted.');
    }
}