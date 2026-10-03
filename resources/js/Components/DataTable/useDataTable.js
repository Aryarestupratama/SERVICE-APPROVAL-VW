import { useState, useEffect } from 'react';
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
    storageKey, // opsional; default: per path halaman
    onSortingChange: controlledOnSortingChange,
}) {
    const [internalSorting, setInternalSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const visibilityKey =
        storageKey ?? (typeof window !== 'undefined' ? `datatable:${window.location.pathname}:columns` : null);
    const [columnVisibility, setColumnVisibility] = useState(() => {
        try {
            const raw = visibilityKey && window.localStorage.getItem(visibilityKey);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });
    useEffect(() => {
        if (!visibilityKey) return;
        try {
            window.localStorage.setItem(visibilityKey, JSON.stringify(columnVisibility));
        } catch { /* abaikan */ }
    }, [visibilityKey, columnVisibility]);
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