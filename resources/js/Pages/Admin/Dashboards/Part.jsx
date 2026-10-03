import { useMemo, useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/Components/ui/tooltip';
import { Info } from 'lucide-react';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
}

const formatNumber = (value) => Number(value ?? 0).toLocaleString('id-ID');

function NumCell({ children }) {
    return <div className="text-right tabular-nums">{children}</div>;
}

// Header kolom dengan penjelasan: berada di dalam <button> sort, jadi pakai title + sr-only (bukan tombol lagi).
function ColumnHeaderWithTooltip({ label, tooltip }) {
    return (
        <span className="flex items-center gap-1" title={tooltip}>
            {label}
            <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{tooltip}</span>
        </span>
    );
}

const filterDefs = [
    {
        key: 'period',
        label: 'Period',
        type: 'date',
        presetOptions: [
            { key: 'all', label: 'All Time' },
            { key: '7d', label: 'Last 7 Days' },
            { key: '30d', label: 'Last 30 Days' },
            { key: '1y', label: 'Last Year' },
        ],
    },
];

const emptyPeriodFilter = { mode: 'preset', preset: 'all', from: '', to: '' };

// Label kartu ringkasan + icon Info + Tooltip penjelas — dipakai bareng oleh
// kartu Revenue Approved & Revenue Rejected (sama-sama butuh disclaimer
// bahwa angka ini gabungan part + labour, sudah dikurangi diskon).
function SummaryLabelWithTooltip({ label, tooltip }) {
    return (
        <span className="flex items-center gap-1">
            {label}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label={`About ${label}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                        <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
            </Tooltip>
        </span>
    );
}

export default function Part({ partStats, summary, filters }) {
    const [activeFilters, setActiveFilters] = useState(() => ({
        period: filters?.period_mode === 'range'
            ? { mode: 'range', preset: 'all', from: filters?.period_from ?? '', to: filters?.period_to ?? '' }
            : { mode: 'preset', preset: filters?.period_preset ?? 'all', from: '', to: '' },
    }));
    const [sorting, setSorting] = useState(() =>
        filters?.sort_by ? [{ id: filters.sort_by, desc: filters.sort_dir === 'desc' }] : []
    );
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));
        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    // Lewati render pertama supaya tidak ada request ganda saat halaman dibuka.
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            const period = activeFilters.period ?? emptyPeriodFilter;
            const activeSort = sorting[0];
            router.get(
                route('admin.dashboards.part-performance'),
                {
                    period_mode: period.mode,
                    period_preset: period.mode === 'preset' ? period.preset : undefined,
                    period_from: period.mode === 'range' ? (period.from || undefined) : undefined,
                    period_to: period.mode === 'range' ? (period.to || undefined) : undefined,
                    sort_by: activeSort?.id || undefined,
                    sort_dir: activeSort ? (activeSort.desc ? 'desc' : 'asc') : undefined,
                },
                { preserveState: true, replace: true }
            );
        }, 400);
        return () => clearTimeout(timeout);
    }, [activeFilters, sorting]);

    const columns = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Part / Item',
                meta: { label: 'Part / Item' },
                cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
            },
            {
                accessorKey: 'used_count',
                header: 'Times Added',
                meta: { label: 'Times Added', align: 'right' },
                cell: ({ row }) => <NumCell>{formatNumber(row.original.used_count)}</NumCell>,
            },
            {
                accessorKey: 'revenue',
                header: 'Revenue',
                meta: { label: 'Revenue', align: 'right' },
                cell: ({ row }) => <NumCell>{formatCurrency(row.original.revenue)}</NumCell>,
            },
            {
                accessorKey: 'approved_count',
                header: 'Approved',
                meta: { label: 'Approved', align: 'right' },
                cell: ({ row }) => <NumCell>{formatNumber(row.original.approved_count)}</NumCell>,
            },
            {
                accessorKey: 'rejected_count',
                header: 'Rejected',
                meta: { label: 'Rejected', align: 'right' },
                cell: ({ row }) => <NumCell>{formatNumber(row.original.rejected_count)}</NumCell>,
            },
            {
                accessorKey: 'reject_rate',
                header: () => <ColumnHeaderWithTooltip label="Reject Rate" tooltip="Rejected items ÷ (approved + rejected items). Items still pending are not counted. The number in brackets is how many items were decided." />,
                meta: { label: 'Reject Rate', align: 'right' },
                cell: ({ row }) => (
                    <NumCell>
                        {formatPercent(row.original.reject_rate)}
                        <span className="ml-1 text-xs text-muted-foreground">({row.original.decided_count ?? 0})</span>
                    </NumCell>
                ),
            },
        ],
        []
    );

    // partStats hasil paginate() dari backend (bentuk { data, links, ... })
    // supaya DataTablePagination bisa jalan sama seperti halaman admin lain.
    const table = useDataTable({
        data: partStats.data,
        columns,
        manualSorting: true,
        sorting,
        onSortingChange: setSorting,
    });

    return (
        <AdminLayout title="Dashboard - Part">
            <Head title="Dashboard Part" />

            <TooltipProvider delayDuration={200}>
                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                <SummaryLabelWithTooltip
                                    label="Total Revenue Approved"
                                    tooltip="Total revenue from items approved by the customer — combined Part + Labour, after each discount is applied, including VAT."
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">
                                {formatCurrency(summary.total_revenue_approved)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                <SummaryLabelWithTooltip
                                    label="Total Revenue Rejected"
                                    tooltip="Total potential revenue from items rejected by the customer — combined Part + Labour, after each discount is applied, including VAT."
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">
                                {formatCurrency(summary.total_revenue_rejected)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Most Rejected Part
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{summary.most_rejected_name ?? '—'}</p>
                        </CardContent>
                    </Card>
                </div>
            </TooltipProvider>

            <DataTable
                table={table}
                links={partStats.links}
                emptyMessage="No part data yet."
                isLoading={isLoading}
                isFiltered={activeFilters.period?.mode === 'range' || activeFilters.period?.preset !== 'all'}
                filterSlot={
                    <DataTableFilterPanel
                        filters={filterDefs}
                        values={activeFilters}
                        onChange={(key, value) => setActiveFilters((c) => ({ ...c, [key]: value }))}
                        onClear={() => setActiveFilters({ period: emptyPeriodFilter })}
                        table={table}
                    />
                }
                paginationMeta={{ from: partStats.from, to: partStats.to, total: partStats.total }}
            />
        </AdminLayout>
    );
}