<?php

namespace App\Services;

use App\Models\InspectionItem;
use App\Models\Setting;
use RuntimeException;

class InspectionItemPricingService
{
    /**
     * Hitung & kunci final_price_snapshot untuk satu inspection item.
     *
     * Aturan (PROJECT-RULES.md bagian 2, dikonfirmasi owner 2026-07-31):
     * - Hanya berlaku saat item BARU SAJA di-approve customer.
     * - Sekali terisi, snapshot TIDAK PERNAH dihitung ulang / diedit lagi —
     *   diskon juga ikut locked di titik ini, jadi method ini idempotent:
     *   kalau snapshot sudah ada, langsung return apa adanya tanpa recalculate.
     * - PPN diambil dari settings.ppn_percent YANG BERLAKU SAAT approve,
     *   bukan on-the-fly, supaya invoice lama tidak berubah retroaktif
     *   kalau tarif PPN diganti admin di kemudian hari.
     */
    public function lockFinalPrice(InspectionItem $item): InspectionItem
    {
        // Idempotent guard — sudah pernah dikunci sebelumnya, jangan sentuh lagi.
        if ($item->final_price_snapshot !== null) {
            return $item;
        }

        if ($item->status !== 'approved') {
            throw new RuntimeException(
                "Tidak bisa menghitung final_price_snapshot untuk item #{$item->id}: "
                . "status masih '{$item->status}', harus 'approved' dulu."
            );
        }

        $ppnPercent = (float) Setting::current()->ppn_percent;

        $itemAfterDiscount = $this->applyDiscount(
            (float) $item->cost_item,
            (float) $item->discount_item_percent
        );

        $labourAfterDiscount = $this->applyDiscount(
            (float) $item->cost_labour,
            (float) $item->discount_labour_percent
        );

        $subtotal = $itemAfterDiscount + $labourAfterDiscount;
        $finalPrice = $subtotal * (1 + $ppnPercent / 100);

        $item->final_price_snapshot = round($finalPrice, 2);
        $item->save();

        return $item;
    }

    private function applyDiscount(float $amount, float $discountPercent): float
    {
        return $amount * (1 - $discountPercent / 100);
    }

    /**
     * Total grand total untuk satu service order — jumlah final_price_snapshot
     * semua item yang statusnya approved. Item pending/rejected tidak dihitung.
     *
     * Catatan: TODO bagian 7C #2 menyebut "grand total per service_order belum
     * diimplementasi" — method ini yang mengisi kebutuhan itu.
     */
    public function grandTotalForOrder(iterable $inspectionItems): float
    {
        $total = 0.0;

        foreach ($inspectionItems as $item) {
            if ($item->status === 'approved' && $item->final_price_snapshot !== null) {
                $total += (float) $item->final_price_snapshot;
            }
        }

        return round($total, 2);
    }

    /**
     * Breakdown subtotal/VAT/grand total per kelompok (group) — versi ESTIMASI,
     * live calculation dari semua item apapun statusnya (pending/approved/rejected),
     * pakai VAT rate yang berlaku SAAT INI (bukan snapshot).
     *
     * Beda dengan grandTotalForOrder() yang cuma hitung item approved pakai
     * final_price_snapshot yang sudah dikunci — dua-duanya sengaja dipertahankan
     * terpisah (dikonfirmasi owner 2026-08-03): satu untuk "kalau semua item
     * disetujui hari ini segini totalnya", satu untuk "yang sudah pasti approved".
     */
    public function breakdownByGroup(iterable $inspectionItems, ?float $vatPercent = null): array
    {
        $vatPercent ??= (float) Setting::current()->ppn_percent;

        $itemsByGroup = [];
        foreach ($inspectionItems as $item) {
            $itemsByGroup[$item->group][] = $item;
        }

        $result = [];
        foreach ($itemsByGroup as $group => $items) {
            $subtotal = array_reduce(
                $items,
                fn ($carry, $item) => $carry + $this->itemSubtotal($item),
                0.0
            );
            $vatAmount = $subtotal * ($vatPercent / 100);

            $result[$group] = [
                'subtotal' => round($subtotal, 2),
                'vat_amount' => round($vatAmount, 2),
                'grand_total' => round($subtotal + $vatAmount, 2),
            ];
        }

        return $result;
    }

    /**
     * Subtotal 1 item SEBELUM VAT — (part - diskon) + (labour - diskon).
     * Dipakai untuk breakdown estimasi (belum tentu approved/locked).
     */
    private function itemSubtotal(InspectionItem $item): float
    {
        $itemAfterDiscount = $this->applyDiscount(
            (float) $item->cost_item,
            (float) $item->discount_item_percent
        );
        $labourAfterDiscount = $this->applyDiscount(
            (float) $item->cost_labour,
            (float) $item->discount_labour_percent
        );

        return $itemAfterDiscount + $labourAfterDiscount;
    }
}