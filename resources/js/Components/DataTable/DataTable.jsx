import { flexRender } from '@tanstack/react-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
} from '@/Components/ui/table';
import { DataTableColumnHeader } from './DataTableColumnHeader';
import { DataTablePagination } from './DataTablePagination';
import { DataTableToolbar } from './DataTableToolbar';

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
    primaryAction,
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
                    primaryAction={primaryAction}
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
                        {table.getRowModel().rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columnCount} className="py-8 text-center text-vw-grey">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        )}
                        {table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id}>
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