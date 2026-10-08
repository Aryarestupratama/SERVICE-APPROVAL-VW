<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderPaymentReceipt;
use App\Models\Setting;
use App\Services\InspectionItemPricingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class InspectionReportController extends Controller
{
    public function show(string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)
            ->with(['vehicle.customer', 'serviceAdvisor', 'technician', 'videos', 'inspectionItems', 'invoice', 'estimationDocuments', 'customerPaymentReceipt'])
            ->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            // Hanya data minimum untuk tombol "Request a new link" di LinkExpired.jsx.
            $settings = Setting::current();

            return Inertia::render('Public/LinkExpired', [
                'settings' => [
                    'workshop_name' => $settings->workshop_name,
                    'booking_whatsapp_phone' => $settings->booking_whatsapp_phone,
                ],
                'serviceAdvisor' => $serviceOrder->serviceAdvisor ? [
                    'name' => $serviceOrder->serviceAdvisor->name,
                    'phone' => $serviceOrder->serviceAdvisor->phone,
                ] : null,
            ]);
        }

        $settings = Setting::current();

        // Section "Estimation Form" vs "Invoice Form" dinamis berdasarkan status
        // (PROJECT-RULES.md bagian 5) — hanya salah satu yang aktif di satu waktu,
        // bukan 2 section terpisah selamanya.
        // CHANGED: estimation form sekarang tetap tampil di quality_control juga,
        // tidak cuma work_in_progress — supaya customer masih bisa lihat/refer ke
        // estimation form selama proses QC berlangsung, sebelum invoice section
        // menggantikannya begitu masuk invoice_preparation.
        $showEstimationViewer = in_array($serviceOrder->status, [
            ServiceOrder::STATUS_WORK_IN_PROGRESS,
            ServiceOrder::STATUS_QUALITY_CONTROL,
        ], true);

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
                'website_url' => $settings->website_url,
                'ppn_percent' => (float) $settings->ppn_percent,

                // Thank You section (Revisi Besar #2, poin 9) — hanya dipakai
                // JSX saat order.status === 'completed', tapi dikirim selalu
                // supaya controller tidak perlu tahu logika kondisional ini.
                'era_phone' => $settings->era_phone,
                'booking_whatsapp_phone' => $settings->booking_whatsapp_phone,
            ],
            'order' => [
                'id' => $serviceOrder->id,
                'work_order_number' => $serviceOrder->work_order_number,
                'status' => $serviceOrder->status,
                'items_approval_status' => $serviceOrder->items_approval_status,
                'personal_message' => $serviceOrder->personal_message,
                'inspection_fee' => (float) $serviceOrder->inspection_fee,
                'inspection_fee_note' => $serviceOrder->inspection_fee_note,
                'invoice_number' => $serviceOrder->invoice_number,
                'bill_to' => $serviceOrder->bill_to,
                // Nilai awal untuk hook polling di sisi frontend — supaya poll
                // pertama punya basis pembanding tanpa perlu fetch tambahan
                // begitu halaman dibuka (PROJECT-RULES.md bagian 12.4).
                'last_activity_at' => optional($serviceOrder->last_activity_at)->toJSON(),
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
                'phone' => $serviceOrder->serviceAdvisor->phone,
                'photo_path' => $serviceOrder->serviceAdvisor->photo_path,
            ],
            'chiefTechnician' => $serviceOrder->technician
                ? [
                    'name' => $serviceOrder->technician->name,
                    'photo_path' => $serviceOrder->technician->photo_path,
                ]
                : null,
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
            // Invoice sekarang 1 file per order (revisi balik ke 1 WO : 1 invoice,
            // PROJECT-RULES.md bagian 2 & TODO bagian 7) — null kalau belum masuk
            // status yang relevan ATAU SA belum sempat upload.
            'invoice' => $showInvoiceViewer && $serviceOrder->invoice
                ? [
                    'id' => $serviceOrder->invoice->id,
                    'file_path' => $serviceOrder->invoice->file_path,
                ]
                : null,
            // Estimation form per kelompok — hanya kirim yang benar-benar sudah
            // ada file-nya (pdf_path terisi), dan hanya saat work_in_progress
            // atau quality_control (lihat $showEstimationViewer di atas).
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
            'customerPaymentReceipt' => $serviceOrder->customerPaymentReceipt
                ? [
                    'file_path' => $serviceOrder->customerPaymentReceipt->file_path,
                    'uploaded_at' => $serviceOrder->customerPaymentReceipt->uploaded_at,
                ]
                : null,
        ]);
    }

    /**
     * Endpoint super ringan untuk polling + change-detection sisi publik
     * (PROJECT-RULES.md bagian 12.4 poin 3) — akses pakai token, bukan {id}
     * langsung, sama seperti endpoint publik lainnya. HANYA mengembalikan
     * last_activity_at, tidak query relasi apapun.
     */
    public function lastActivity(string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)->firstOrFail();

        return response()->json([
            'last_activity_at' => optional($serviceOrder->last_activity_at)->toJSON(),
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
            $stillPending = ServiceOrder::hasPendingItems($freshItems);

            $updates = [
                'items_approval_status' => ServiceOrder::computeApprovalStatus($freshItems),
                // Selalu disentuh di sini (bukan cuma saat !$stillPending di
                // bawah) karena keputusan approve/reject tetap perubahan
                // relevan buat polling admin walau negosiasi belum final
                // (PROJECT-RULES.md bagian 12.4 poin 2).
                'last_activity_at' => now(),
            ];

            // Negosiasi baru dianggap final kalau tidak ada item pending tersisa.
            // Selama masih ada yang pending (skenario reopen item di masa depan),
            // finalized_at belum di-set — customer masih bisa submit lagi nanti.
            if (!$stillPending) {
                $updates['finalized_at'] = now();

                // Satu-satunya transisi status utama yang otomatis di sini:
                // kalau benar-benar semua item ditolak, order dibatalkan.
                // Selain itu (approved semua/sebagian), status TETAP 'work_in_progress'
                // — SA yang lanjutkan manual ke quality_control kapan siap.
                if ($updates['items_approval_status'] === ServiceOrder::ITEMS_APPROVAL_REJECTED) {
                    $updates['status'] = ServiceOrder::STATUS_ALL_REJECTED_CANCELLED;
                }
            }

            $serviceOrder->update($updates);
        });

        return back()->with('success', 'Your decisions have been submitted.');
    }

    /**
     * Customer membatalkan keputusan approve/reject yang SUDAH disubmit — item
     * dikembalikan ke 'pending' supaya bisa diputuskan ulang lewat
     * submitDecisions().
     *
     * Aturan waktunya sama dengan submitDecisions(): hanya selama order masih
     * 'work_in_progress'. Begitu SA memindahkan order ke quality_control atau
     * setelahnya, keputusan terkunci. Guard ini WAJIB di server — menyembunyikan
     * tombol di frontend bukan pengaman.
     *
     * Catatan: kalau SEMUA item ditolak, submitDecisions() otomatis mengubah
     * status order jadi 'all_rejected_cancelled'. Order yang sudah berstatus itu
     * TIDAK bisa di-undo dari sini (status bukan work_in_progress lagi).
     */
    public function undoDecision(Request $request, string $token)
    {
        $validated = $request->validate([
            'item_id' => ['required', 'integer'],
        ]);

        DB::transaction(function () use ($request, $token, $validated) {
            // lockForUpdate: kalau SA menekan "ke Quality Control" di detik yang
            // sama, salah satu menunggu yang lain — status yang dicek di bawah
            // pasti yang terbaru, bukan data basi.
            $serviceOrder = ServiceOrder::where('inspection_token', $token)
                ->lockForUpdate()
                ->firstOrFail();

            if ($serviceOrder->isInspectionLinkExpired()) {
                abort(410, 'This link has expired.');
            }

            if ($serviceOrder->status !== ServiceOrder::STATUS_WORK_IN_PROGRESS) {
                abort(409, 'Decisions can no longer be changed for this order.');
            }

            // Lewat relasi order ini, jadi item milik order lain tidak bisa disentuh
            // walau item_id-nya ditebak.
            $item = $serviceOrder->inspectionItems()->findOrFail($validated['item_id']);

            if ($item->status === 'pending') {
                return; // sudah pending, tidak ada yang perlu dibatalkan
            }

            $oldStatus = $item->status;

            // final_price_snapshot dikosongkan: harga dikunci ulang otomatis oleh
            // lockFinalPrice() kalau item ini di-approve lagi nanti.
            $item->update([
                'status' => 'pending',
                'decided_at' => null,
                'final_price_snapshot' => null,
            ]);

            $item->logs()->create([
                'old_status' => $oldStatus,
                'new_status' => 'pending',
                'actor_type' => 'customer',
                'actor_id' => null,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $freshItems = $serviceOrder->inspectionItems()->get();

            $serviceOrder->update([
                'items_approval_status' => ServiceOrder::computeApprovalStatus($freshItems),
                // Sekarang ada item pending lagi, jadi negosiasi belum final. Ini juga
                // otomatis memblokir SA pindah ke quality_control (guard finalized_at
                // di updateStatus()) sampai customer memutuskan ulang.
                'finalized_at' => null,
                'last_activity_at' => now(),
            ]);
        });

        return back()->with('success', 'Your decision has been cancelled.');
    }

    /**
     * Customer upload bukti bayar (transfer) selama status invoice_preparation.
     * Sama pola dengan submitDecisions() — akses via token, tidak perlu login.
     */
    public function uploadPaymentReceipt(Request $request, string $token)
    {
        $serviceOrder = ServiceOrder::where('inspection_token', $token)->firstOrFail();

        if ($serviceOrder->isInspectionLinkExpired()) {
            abort(410, 'This link has expired.');
        }

        if ($serviceOrder->status !== ServiceOrder::STATUS_INVOICE_PREPARATION) {
            abort(409, 'Payment receipt can only be uploaded while invoice is being prepared.');
        }

        $validated = $request->validate([
            'receipt' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        DB::transaction(function () use ($validated, $request, $serviceOrder) {
            $existing = $serviceOrder->customerPaymentReceipt;
            $oldPath = $existing?->file_path;

            // Simpan file baru DULU — kalau ini gagal, bukti bayar lama masih utuh.
            $path = $request->file('receipt')->store('payment-receipts', 'public');

            ServiceOrderPaymentReceipt::updateOrCreate(
                [
                    'service_order_id' => $serviceOrder->id,
                    'uploader_type' => ServiceOrderPaymentReceipt::UPLOADER_CUSTOMER,
                ],
                [
                    'file_path' => $path,
                    'uploaded_at' => now(),
                ]
            );

            // Baru hapus yang lama SETELAH file baru + row DB dipastikan berhasil.
            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }

            $serviceOrder->touchActivity();
        });

        return back()->with('success', 'Payment receipt uploaded.');
    }
}