import { useState } from 'react';
import {
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    useReactTable,
} from '@tanstack/react-table';

export function useDataTable({
    data,
    columns,
    manualSorting = false,
    sorting: controlledSorting,
    onSortingChange: controlledOnSortingChange,
}) {
    const [internalSorting, setInternalSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnVisibility, setColumnVisibility] = useState({});
    const [columnFilters, setColumnFilters] = useState([]);

    // manualSorting: true dipakai halaman yang kolomnya dihitung via subquery
    // SQL (mis. Grand Total di ServiceOrders/Index.jsx) — sort HARUS lintas
    // semua baris di DB, bukan cuma 20 baris yang sedang tampil di halaman ini.
    // Page yang butuh ini WAJIB supply `sorting` + `onSortingChange` sendiri
    // (disinkronkan ke query params URL, sama pola dengan searchTerm/filters).
    // Halaman lain tetap sorting client-side seperti sebelumnya, tidak berubah.
    const sorting = manualSorting ? controlledSorting : internalSorting;
    const onSortingChange = manualSorting ? controlledOnSortingChange : setInternalSorting;

    const table = useReactTable({
        data,
        columns,
        state: { sorting, globalFilter, columnVisibility, columnFilters },
        onSortingChange,
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnFiltersChange: setColumnFilters,
        manualSorting,
        getCoreRowModel: getCoreRowModel(),
        ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
        getFilteredRowModel: getFilteredRowModel(),
    });

    return table;
}