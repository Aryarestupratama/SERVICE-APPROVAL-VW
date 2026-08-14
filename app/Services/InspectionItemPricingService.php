<?php

namespace App\Services;

use App\Models\InspectionItem;
use App\Models\Setting;
use RuntimeException;

class InspectionItemPricingService
{
    /**
     * Hitung & kunci final_price_snapshot untuk satu inspection item.
     * (Tidak berubah dari sebelumnya.)
     */
    public function lockFinalPrice(InspectionItem $item): InspectionItem
    {
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

        $item->final_price_snapshot = round($finalPrice);
        $item->save();

        return $item;
    }

    private function applyDiscount(float $amount, float $discountPercent): float
    {
        return $amount * (1 - $discountPercent / 100);
    }

    /**
     * Kontribusi 1 item ke total — item 'rejected' dikecualikan (return
     * null). Item yang sudah locked (final_price_snapshot terisi) TETAP
     * pakai snapshot itu sebagai 'total' (tidak pernah berubah), tapi
     * subtotal & VAT-nya dipecah balik pakai $vatPercent SAAT INI — ini
     * valid selama tarif PPN belum pernah diganti sejak item itu di-lock.
     * Kalau tarif PPN memang berubah di kemudian hari, breakdown
     * subtotal/vat bisa sedikit meleset, TAPI 'total' tetap akurat karena
     * tetap pakai angka snapshot asli, bukan dihitung ulang dari awal.
     *
     * Ini SATU-SATUNYA tempat aturan ini didefinisikan — dipakai oleh
     * breakdownByGroup() supaya konsisten dengan Show.jsx & InspectionReport.jsx
     * di frontend yang menerapkan logika identik.
     */
    private function itemContribution(InspectionItem $item, float $vatPercent): ?array
    {
        if ($item->status === 'rejected') {
            return null;
        }

        if ($item->final_price_snapshot !== null) {
            $total = (float) $item->final_price_snapshot;
            $sub = $total / (1 + $vatPercent / 100);

            return [
                'subtotal' => $sub,
                'vat' => $total - $sub,
                'total' => $total,
            ];
        }

        $sub = $this->itemSubtotal($item);
        $vat = $sub * ($vatPercent / 100);

        return [
            'subtotal' => $sub,
            'vat' => $vat,
            'total' => $sub + $vat,
        ];
    }

    /**
     * Total grand total untuk satu service order — jumlah item approved
     * (pakai final_price_snapshot yang sudah locked). Item pending/rejected
     * tidak dihitung. (Tidak berubah dari sebelumnya.)
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
     * Breakdown subtotal/VAT/grand total per kelompok (group) — versi
     * ESTIMASI, live calculation dari item apapun statusnya KECUALI
     * rejected (dikecualikan), pakai VAT rate yang berlaku SAAT INI.
     *
     * CHANGED: item 'rejected' sekarang dikecualikan dari perhitungan (dulu
     * ikut dijumlahkan). Item yang sudah locked pakai final_price_snapshot
     * sebagai basis grand_total (tidak pernah berubah), tapi subtotal & vat
     * dipecah balik pakai $vatPercent saat ini — lihat itemContribution().
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
            $subtotal = 0.0;
            $vatAmount = 0.0;
            $grandTotal = 0.0;

            foreach ($items as $item) {
                $contribution = $this->itemContribution($item, $vatPercent);

                if ($contribution === null) {
                    continue; // rejected, dikecualikan
                }

                $subtotal += $contribution['subtotal'];
                $vatAmount += $contribution['vat'];
                $grandTotal += $contribution['total'];
            }

            $result[$group] = [
                'subtotal' => round($subtotal, 2),
                'vat_amount' => round($vatAmount, 2),
                'grand_total' => round($grandTotal, 2),
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