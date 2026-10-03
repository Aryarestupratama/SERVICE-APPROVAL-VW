import { useMemo, useState, useEffect, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, Head, Link } from '@inertiajs/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { Button } from '@/Components/ui/button';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';
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

// Header kolom + icon Info + Tooltip penjelas — dipakai bareng oleh kolom
// Revenue Approved & Revenue Rejected (sama-sama butuh disclaimer bahwa
// angka ini gabungan part + labour, sudah dikurangi diskon). Sama pola
// dengan SummaryLabelWithTooltip di Admin/Dashboards/Part.jsx.
function ColumnHeaderWithTooltip({ label, tooltip }) {
    // Header ini berada di dalam <button> sort (DataTableColumnHeader), jadi tidak boleh ada
    // tombol lagi di dalamnya: pakai title (hover) + teks sr-only untuk pembaca layar.
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

export default function Sa({ saStats, summary, filters }) {
    const [activeFilters, setActiveFilters] = useState(() => ({
        period: filters?.period_mode === 'range'
            ? { mode: 'range', preset: 'all', from: filters?.period_from ?? '', to: filters?.period_to ?? '' }
            : { mode: 'preset', preset: filters?.period_preset ?? 'all', from: '', to: '' },
    }));

    const [isLoading, setIsLoading] = useState(false);

    // Wiring isLoading ke DataTable — sama pola dengan Admin/Vehicles/Index.jsx
    // (PROJECT-RULES bagian 7, TODO "Wire prop isLoading").
    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));

        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    // Flag "sudah pernah mount belum" — useEffect di bawah selalu jalan sekali
    // saat render pertama juga (bukan cuma saat activeFilters berubah dari
    // interaksi user). Tanpa guard ini, tiap kali halaman dibuka dari sidebar
    // terjadi 2 request: (1) load awal dari Inertia visit, lalu (2) request
    // redundan dari effect ini 400ms kemudian dengan filter period yang
    // isinya sama persis — terlihat seperti halaman "reload 2x". Sama fix-nya
    // dengan Vehicles/Customers/Users/Vehicle Customer/Service Orders Index.jsx.
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

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
            {
                accessorKey: 'order_count',
                header: 'Orders',
                meta: { label: 'Orders', align: 'right' },
                cell: ({ row }) => <NumCell>{formatNumber(row.original.order_count)}</NumCell>,
            },
            {
                accessorKey: 'revenue_approved',
                header: () => (
                    <ColumnHeaderWithTooltip
                        label="Revenue Approved"
                        tooltip="Total revenue from items approved by the customer — combined Part + Labour, after each discount is applied, including VAT."
                    />
                ),
                meta: { label: 'Revenue Approved', align: 'right' },
                cell: ({ row }) => <NumCell>{formatCurrency(row.original.revenue_approved)}</NumCell>,
            },
            {
                accessorKey: 'revenue_rejected',
                header: () => (
                    <ColumnHeaderWithTooltip
                        label="Revenue Rejected"
                        tooltip="Total potential revenue from items rejected by the customer — combined Part + Labour, after each discount is applied, including VAT."
                    />
                ),
                meta: { label: 'Revenue Rejected', align: 'right' },
                cell: ({ row }) => <NumCell>{formatCurrency(row.original.revenue_rejected)}</NumCell>,
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
                accessorKey: 'approve_rate',
                header: () => <ColumnHeaderWithTooltip label="Approve Rate" tooltip="Approved items ÷ (approved + rejected items). Items still pending are not counted. The number in brackets is how many items were decided." />,
                meta: { label: 'Approve Rate', align: 'right' },
                cell: ({ row }) => (
                    <NumCell>
                        {formatPercent(row.original.approve_rate)}
                        <span className="ml-1 text-xs text-muted-foreground">({row.original.decided_count ?? 0})</span>
                    </NumCell>
                ),
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
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                enableHiding: false,
                meta: { label: 'Actions' },
                // Reuse Admin/ServiceOrders/Index.jsx lewat query filter service_advisor_id
                // (didukung ServiceOrderController::index dan dibawa terus oleh Index.jsx).
                cell: ({ row }) => (
                    <Button asChild variant="outline" size="sm">
                        <Link href={route('admin.service-orders.index', { service_advisor_id: row.original.id })}>
                            View Orders
                        </Link>
                    </Button>
                ),
            },
        ],
        []
    );

    const table = useDataTable({ data: saStats, columns });

    return (
        <AdminLayout title="Dashboard - Service Advisor">

            <Head title="Dashboard SA" />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
                        </CardHeader>
                        <CardContent><p className="text-2xl font-semibold">{summary.total_orders}</p></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Approved Orders</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{summary.approved_order_count}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Partially Approved Orders
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{summary.partially_approved_order_count}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Total Revenue Approved
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">
                                {formatCurrency(summary.total_revenue_approved)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            

            <DataTable
                table={table}
                links={[]}
                emptyMessage="No service advisor data yet."
                isLoading={isLoading}
                filterSlot={
                    <DataTableFilterPanel
                        filters={filterDefs}
                        values={activeFilters}
                        onChange={handleFilterChange}
                        onClear={handleFilterClear}
                        table={table}
                    />
                }
            />
        </AdminLayout>
    );
}