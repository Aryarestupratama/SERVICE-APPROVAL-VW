import { DataTableSearchInput } from './DataTableSearchInput';

// Toolbar generic untuk DataTable — layout DIREVISI (2026-09-20, revisi ke-2,
// sebelumnya 2026-08-03 lalu 2026-09-20 revisi ke-1):
//
// [ Search ]  ...spacer...  [ filterSlot, di tengah ]  ...spacer...  [ Primary action ]
//
// - Search: default pakai DataTableSearchInput + globalFilter client-side.
//   Untuk halaman dengan search server-side (Customers/Users/Vehicles/Service
//   Orders), override lewat prop `searchSlot` supaya posisi & style tetap
//   identik, bukan ditulis manual di luar toolbar seperti sebelumnya.
// - filterSlot: SEKARANG satu-satunya tempat untuk filter DAN column
//   visibility — keduanya digabung jadi 1 tombol "Filter" di dalam
//   `DataTableFilterPanel` (lihat file itu), bukan lagi 2 tombol terpisah
//   (Filter + Columns). Toolbar TIDAK LAGI render dropdown Columns sendiri —
//   supaya section Columns muncul, halaman pemanggil wajib kirim prop
//   `table={table}` ke `<DataTableFilterPanel />` yang dipasang di
//   `filterSlot`. Berlaku seragam untuk SEMUA halaman admin index (Service
//   Orders, Vehicles, Customers, Users).
// - primaryAction: tombol utama halaman (Add Service Order, dst), SELALU di
//   ujung paling kanan toolbar (di atas tabel) — prop opsional, kalau tidak
//   diisi halaman tetap bisa pasang tombolnya sendiri di `headerActions`
//   AdminLayout seperti pola lama.
export function DataTableToolbar({
    table,
    searchPlaceholder = 'Search...',
    searchSlot,
    filterSlot,
    primaryAction,
}) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-72">
                {searchSlot ?? (
                    <DataTableSearchInput
                        value={table.getState().globalFilter ?? ''}
                        onChange={(e) => table.setGlobalFilter(e.target.value)}
                        placeholder={searchPlaceholder}
                    />
                )}
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
                {filterSlot}
            </div>

            {primaryAction && <div className="ml-auto">{primaryAction}</div>}
        </div>
    );
}