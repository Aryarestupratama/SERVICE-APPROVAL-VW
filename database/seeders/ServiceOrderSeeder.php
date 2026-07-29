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

        // --- Service Order #1: masih draft, belum dikirim ke customer ---
        $order1Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 1,
            'service_advisor_id' => 2,
            'technician_id' => null,
            'status' => 'draft',
            'inspection_fee' => 150000,
            'inspection_fee_note' => 'Biaya cek diagnostik standar',
            'personal_message' => null,
            'inspection_token' => null,
            'inspection_token_expires_at' => null,
            'invoice_token' => null,
            'finalized_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // --- Service Order #2: sudah dikirim, menunggu keputusan customer ---
        $order2Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 2,
            'service_advisor_id' => 2,
            'technician_id' => 2, // SA yang sama plotting dirinya sbg pengerjaan, contoh dummy
            'status' => 'awaiting_approval',
            'inspection_fee' => 100000,
            'inspection_fee_note' => 'Biaya cek rem & suspensi',
            'personal_message' => 'Halo Kak Rina, berikut hasil inspeksi kendaraan Anda. Mohon dicek videonya ya.',
            'inspection_token' => Str::random(32),
            'inspection_token_expires_at' => now()->addDays(7),
            'invoice_token' => null,
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
            'cost' => 850000,
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
            'cost' => 350000,
            'is_urgent' => false,
            'status' => 'pending',
            'decided_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // --- Service Order #3: sudah completed & ada invoice ---
        $order3Id = DB::table('service_orders')->insertGetId([
            'vehicle_id' => 3,
            'service_advisor_id' => 3,
            'technician_id' => 3,
            'status' => 'completed',
            'inspection_fee' => 150000,
            'inspection_fee_note' => 'Biaya cek diagnostik lengkap',
            'personal_message' => 'Halo Kak Hendra, servis sudah selesai, berikut rinciannya.',
            'inspection_token' => Str::random(32),
            'inspection_token_expires_at' => now()->subDays(3), // sudah lewat, karena sudah final
            'invoice_token' => Str::random(32),
            'finalized_at' => now()->subDays(5),
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

        $item3aId = DB::table('inspection_items')->insertGetId([
            'service_order_id' => $order3Id,
            'name' => 'Ganti oli mesin + filter',
            'description' => null,
            'cost' => 650000,
            'is_urgent' => false,
            'status' => 'approved',
            'decided_at' => now()->subDays(5),
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(5),
        ]);

        $item3bId = DB::table('inspection_items')->insertGetId([
            'service_order_id' => $order3Id,
            'name' => 'Ganti timing belt',
            'description' => 'Sudah masuk masa servis 60rb km',
            'cost' => 1250000,
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

        // Invoice: dummy, format resmi belum final (lihat PROJECT-RULES.md Fase 0 & bagian 2)
        $subtotal = 650000; // hanya item yang approved
        $vat = $subtotal * 0.11;

        DB::table('invoices')->insert([
            'service_order_id' => $order3Id,
            'invoice_number' => 'INV-000001',
            'subtotal' => $subtotal,
            'vat_amount' => $vat,
            'total' => $subtotal + $vat,
            'status' => 'paid',
            'issued_at' => now()->subDays(3),
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDays(3),
        ]);
    }
}