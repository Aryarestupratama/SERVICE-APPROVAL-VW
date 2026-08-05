import { useMemo, useState, useEffect } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router } from '@inertiajs/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

function formatPercent(value) {
    return value === null || value === undefined ? '—' : `${value}%`;
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

export default function Sa({ saStats, summary, filters }) {
    const [activeFilters, setActiveFilters] = useState(() => ({
        period: filters?.period_mode === 'range'
            ? { mode: 'range', preset: 'all', from: filters?.period_from ?? '', to: filters?.period_to ?? '' }
            : { mode: 'preset', preset: filters?.period_preset ?? 'all', from: '', to: '' },
    }));

    useEffect(() => {
        const timeout = setTimeout(() => {
            const period = activeFilters.period ?? emptyPeriodFilter;

            router.get(
                route('admin.dashboards.sa-performance'),
                {
                    period_mode: period.mode,
                    period_preset: period.mode === 'preset' ? period.preset : undefined,
                    period_from: period.mode === 'range' ? (period.from || undefined) : undefined,
                    period_to: period.mode === 'range' ? (period.to || undefined) : undefined,
                },
                { preserveState: true, replace: true }
            );
        }, 400);
        return () => clearTimeout(timeout);
    }, [activeFilters]);

    const handleFilterChange = (key, value) => {
        setActiveFilters((current) => ({ ...current, [key]: value }));
    };

    const handleFilterClear = () => {
        setActiveFilters({ period: emptyPeriodFilter });
    };

    const columns = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Service Advisor',
                meta: { label: 'Service Advisor' },
                cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
            },
            { accessorKey: 'order_count', header: 'Orders', meta: { label: 'Orders' } },
            {
                accessorKey: 'revenue',
                header: 'Revenue',
                meta: { label: 'Revenue' },
                cell: ({ row }) => formatCurrency(row.original.revenue),
            },
            { accessorKey: 'approved_count', header: 'Approved', meta: { label: 'Approved' } },
            { accessorKey: 'rejected_count', header: 'Rejected', meta: { label: 'Rejected' } },
            {
                accessorKey: 'approve_rate',
                header: 'Approve Rate',
                meta: { label: 'Approve Rate' },
                cell: ({ row }) => formatPercent(row.original.approve_rate),
            },
            {
                accessorKey: 'reject_rate',
                header: 'Reject Rate',
                meta: { label: 'Reject Rate' },
                cell: ({ row }) => formatPercent(row.original.reject_rate),
            },
        ],
        []
    );

    const table = useDataTable({ data: saStats, columns });

    return (
        <AdminLayout title="Dashboard — Service Advisor">
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{summary.total_orders}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{formatCurrency(summary.total_revenue)}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Overall Approve Rate</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{formatPercent(summary.overall_approve_rate)}</p></CardContent>
                </Card>
            </div>

            <DataTable
                table={table}
                links={[]}
                emptyMessage="No service advisor data yet."
                filterSlot={
                    <DataTableFilterPanel
                        filters={filterDefs}
                        values={activeFilters}
                        onChange={handleFilterChange}
                        onClear={handleFilterClear}
                    />
                }
            />
        </AdminLayout>
    );
}