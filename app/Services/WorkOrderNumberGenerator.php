<?php

namespace App\Services;

use App\Models\ServiceOrder;

class WorkOrderNumberGenerator
{
    /**
     * Generate work_order_number berikutnya secara atomic.
     *
     * WAJIB dipanggil di dalam DB::transaction() yang sama dengan
     * ServiceOrder::create() — lockForUpdate() di sini mengunci baris
     * service_orders sampai transaction commit, jadi request kedua yang
     * juga memanggil generate() akan menunggu (blocked) sampai request
     * pertama selesai insert, bukan ikut membaca max() yang sama.
     *
     * Kalau dipanggil di luar transaction, lock langsung lepas setelah
     * query ini selesai dan proteksinya jadi tidak berarti.
     */
    public function generate(): int
    {
        $max = ServiceOrder::lockForUpdate()->max('work_order_number') ?? 0;

        return $max + 1;
    }
}