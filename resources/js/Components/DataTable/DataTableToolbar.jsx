import { Button } from '@/Components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import { SlidersHorizontal } from 'lucide-react';
import { DataTableSearchInput } from './DataTableSearchInput';

// Toolbar generic untuk DataTable — layout final (disepakati 2026-08-03):
//
// [ Search ]  [ Filter slot ]  ...spacer...  [ Columns ]  [ Primary action ]
//
// - Search: default pakai DataTableSearchInput + globalFilter client-side.
//   Untuk halaman dengan search server-side (Customers/Users/Vehicles),
//   override lewat prop `searchSlot` supaya posisi & style tetap identik,
//   bukan ditulis manual di luar toolbar seperti sebelumnya.
// - filterSlot: filter tambahan spesifik per halaman (mis. Select status).
// - Columns toggle: selalu ada selama showColumnsToggle=true.
// - primaryAction: tombol utama halaman (Add Customer, Add Vehicle, dst),
//   SELALU di ujung paling kanan, konsisten di semua halaman admin.
export function DataTableToolbar({
    table,
    searchPlaceholder = 'Search...',
    searchSlot,
    filterSlot,
    showColumnsToggle = true,
    primaryAction,
}) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2">
            {searchSlot ?? (
                <DataTableSearchInput
                    value={table.getState().globalFilter ?? ''}
                    onChange={(e) => table.setGlobalFilter(e.target.value)}
                    placeholder={searchPlaceholder}
                />
            )}

            {filterSlot}

            <div className="ml-auto flex items-center gap-2">
                {showColumnsToggle && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <SlidersHorizontal className="mr-2 h-4 w-4" />
                                Columns
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        className="capitalize"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                    >
                                        {column.columnDef.meta?.label ?? column.id}
                                    </DropdownMenuCheckboxItem>
                                ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {primaryAction}
            </div>
        </div>
    );
}