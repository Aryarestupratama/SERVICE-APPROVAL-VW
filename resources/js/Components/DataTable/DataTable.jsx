import { flexRender } from '@tanstack/react-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
} from '@/Components/ui/table';
import { Skeleton } from '@/Components/ui/skeleton';
import { Inbox } from 'lucide-react';
import { DataTableColumnHeader } from './DataTableColumnHeader';
import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';

const SKELETON_ROWS = 5;

// Layout final (2026-08-03): toolbar (search, filter, columns, primary
// action) selalu di atas tabel, tabel di tengah, pagination di bawah.
// Lihat DataTableToolbar.jsx untuk detail urutan elemen di dalam toolbar.
export function DataTable({
    table,
    links,
    emptyMessage = 'No data yet.',
    searchPlaceholder,
    searchSlot,
    filterSlot,
    showToolbar = true,
    showColumnsToggle = true,
    isLoading = false,
}) {
    const columnCount = table.getAllColumns().length;

    return (
        <>
            {showToolbar && (
                <DataTableToolbar
                    table={table}
                    searchPlaceholder={searchPlaceholder}
                    searchSlot={searchSlot}
                    filterSlot={filterSlot}
                    showColumnsToggle={showColumnsToggle}
                />
            )}
            <div className="rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <DataTableColumnHeader key={header.id} header={header} />
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading &&
                            Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
                                <TableRow key={`skeleton-${rowIndex}`}>
                                    {Array.from({ length: columnCount }).map((_, colIndex) => (
                                        <TableCell key={`skeleton-cell-${colIndex}`}>
                                            <Skeleton className="h-4 w-full max-w-[160px]" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}

                        {!isLoading && table.getRowModel().rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columnCount} className="py-10 text-center text-vw-grey">
                                    <div className="flex flex-col items-center gap-2">
                                        <Inbox className="h-6 w-6 text-vw-grey/40" />
                                        <span>{emptyMessage}</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}

                        {!isLoading &&
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    className="transition-colors hover:bg-vw-grey-light/60"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>
            <DataTablePagination links={links} />
        </>
    );
}