<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ServiceOrderSeeder extends Seeder
{
    public function run(): void
    {
        // ID user: 1 = admin, 2 = Budi (SA), 3 = Sarah (SA) — sesuai UserSeeder
        // ID vehicle: 1 = Tiguan (Andi), 2 = Polo (Rina), 3 = Golf (Hendra)

        // --- Service Order #1: tahap "scheduled" (appointment/preparation), belum ada aktivitas pengerjaan ---
        $order1Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 1,
            'service_advisor_id' => 2,
            'technician_id' => null,
            'work_order_number' => 1,
            'status' => 'scheduled',
            'items_approval_status' => 'pending',
            'inspection_fee' => 150000,
            'inspection_fee_note' => 'Biaya cek diagnostik standar',
            'personal_message' => null,
            'inspection_token' => null,
            'inspection_token_expires_at' => null,
            'invoice_pdf_path' => null,
            'invoice_uploaded_at' => null,
            'invoice_uploaded_by' => null,
            'follow_up_deadline' => null,
            'follow_up_reminder_sent_at' => null,
            'follow_up_escalated_to_admin_at' => null,
            'finalized_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // --- Service Order #2: tahap "in_progress" (check-in & work process, item masih menunggu approval customer) ---
        $order2Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 2,
            'service_advisor_id' => 2,
            'technician_id' => 2, // SA yang sama plotting dirinya sbg pengerjaan, contoh dummy
            'work_order_number' => 2,
            'status' => 'in_progress',
            'items_approval_status' => 'pending',
            'inspection_fee' => 100000,
            'inspection_fee_note' => 'Biaya cek rem & suspensi',
            'personal_message' => 'Halo Kak Rina, berikut hasil inspeksi kendaraan Anda. Mohon dicek videonya ya.',
            'inspection_token' => Str::random(32),
            'inspection_token_expires_at' => now()->addDays(7),
            'invoice_pdf_path' => null,
            'invoice_uploaded_at' => null,
            'invoice_uploaded_by' => null,
            'follow_up_deadline' => null,
            'follow_up_reminder_sent_at' => null,
            'follow_up_escalated_to_admin_at' => null,
            'finalized_at' => null,
            'created_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
        ]);

        DB::table('service_order_videos')->insert([
            [
                'service_order_id' => $order2Id,
                'video_url' => 'https://example.com/videos/order2-part1.mp4',
                'video_source' => 'upload',
                'sort_order' => 0,
                'duration_seconds' => 95,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $item2aId = DB::table('inspection_items')->insertGetId([
            'service_order_id' => $order2Id,
            'name' => 'Ganti kampas rem depan',
            'description' => 'Kampas sudah tipis, sisa ±2mm',
            'cost_item' => 600000,
            'cost_labour' => 250000,
            'discount_item_percent' => 0,
            'discount_labour_percent' => 0,
            'final_price_snapshot' => null, // belum di-approve, belum dikunci
            'is_urgent' => true,
            'status' => 'pending',
            'decided_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('inspection_items')->insert([
            'service_order_id' => $order2Id,
            'name' => 'Spooring & balancing',
            'description' => null,
            'cost_item' => 200000,
            'cost_labour' => 150000,
            'discount_item_percent' => 0,
            'discount_labour_percent' => 0,
            'final_price_snapshot' => null,
            'is_urgent' => false,
            'status' => 'pending',
            'decided_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // --- Service Order #3: tahap "completed" (mobil sudah keluar, invoice PDF sudah diupload SA) ---
        $order3Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 3,
            'service_advisor_id' => 3,
            'technician_id' => 3,
            'work_order_number' => 3,
            'status' => 'completed',
            'items_approval_status' => 'partially_approved', // 1 approved, 1 rejected
            'inspection_fee' => 150000,
            'inspection_fee_note' => 'Biaya cek diagnostik lengkap',
            'personal_message' => 'Halo Kak Hendra, servis sudah selesai, berikut rinciannya.',
            'inspection_token' => Str::random(32),
            'inspection_token_expires_at' => now()->subDays(3), // sudah lewat, karena sudah final
            'invoice_pdf_path' => 'invoices/order-3-work-order-3.pdf',
            'invoice_uploaded_at' => now()->subDays(3),
            'invoice_uploaded_by' => 3, // Sarah (SA) yang upload
            'follow_up_deadline' => null, // sudah completed, siklus follow-up sudah lewat
            'follow_up_reminder_sent_at' => null,
            'follow_up_escalated_to_admin_at' => null,
            'finalized_at' => now()->subDays(3),
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(3),
        ]);

        DB::table('service_order_videos')->insert([
            [
                'service_order_id' => $order3Id,
                'video_url' => 'https://example.com/videos/order3-part1.mp4',
                'video_source' => 'upload',
                'sort_order' => 0,
                'duration_seconds' => 120,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'service_order_id' => $order3Id,
                'video_url' => 'https://example.com/videos/order3-part2.mp4',
                'video_source' => 'upload',
                'sort_order' => 1,
                'duration_seconds' => 80,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Item approved: harga final dihitung & dikunci pas approve (cost_item+cost_labour, PPN 11% berlaku saat itu)
        $item3aCostItem = 450000;
        $item3aCostLabour = 200000;
        $item3aSubtotal = $item3aCostItem + $item3aCostLabour; // 650000, tidak ada diskon
        $item3aFinal = $item3aSubtotal * 1.11; // PPN 11% yang berlaku saat approve

        $item3aId = DB::table('inspection_items')->insertGetId([
            'service_order_id' => $order3Id,
            'name' => 'Ganti oli mesin + filter',
            'description' => null,
            'cost_item' => $item3aCostItem,
            'cost_labour' => $item3aCostLabour,
            'discount_item_percent' => 0,
            'discount_labour_percent' => 0,
            'final_price_snapshot' => $item3aFinal,
            'is_urgent' => false,
            'status' => 'approved',
            'decided_at' => now()->subDays(5),
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(5),
        ]);

        // Item rejected: tidak pernah di-approve, final_price_snapshot tetap null (tidak pernah dikunci)
        $item3bId = DB::table('inspection_items')->insertGetId([
            'service_order_id' => $order3Id,
            'name' => 'Ganti timing belt',
            'description' => 'Sudah masuk masa servis 60rb km',
            'cost_item' => 900000,
            'cost_labour' => 350000,
            'discount_item_percent' => 0,
            'discount_labour_percent' => 0,
            'final_price_snapshot' => null,
            'is_urgent' => true,
            'status' => 'rejected',
            'decided_at' => now()->subDays(5),
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(5),
        ]);

        DB::table('inspection_item_logs')->insert([
            [
                'inspection_item_id' => $item3aId,
                'old_status' => 'pending',
                'new_status' => 'approved',
                'actor_type' => 'customer',
                'actor_id' => null,
                'ip_address' => '36.71.22.10',
                'user_agent' => 'Mozilla/5.0 (Linux; Android 13)',
                'created_at' => now()->subDays(5),
                'updated_at' => now()->subDays(5),
            ],
            [
                'inspection_item_id' => $item3bId,
                'old_status' => 'pending',
                'new_status' => 'rejected',
                'actor_type' => 'customer',
                'actor_id' => null,
                'ip_address' => '36.71.22.10',
                'user_agent' => 'Mozilla/5.0 (Linux; Android 13)',
                'created_at' => now()->subDays(5),
                'updated_at' => now()->subDays(5),
            ],
        ]);

        // Tidak ada lagi insert ke tabel `invoices` — invoice sekarang PDF upload
        // yang path/metadata-nya sudah ditempel langsung di kolom service_orders di atas.
    }
}