import { useMemo, useState, useEffect, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, Head, Link } from '@inertiajs/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { Button } from '@/Components/ui/button';
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
    return value === null || value === undefined ? '—' : `${value}%`;
}

// Header kolom + icon Info + Tooltip penjelas — dipakai bareng oleh kolom
// Revenue Approved & Revenue Rejected (sama-sama butuh disclaimer bahwa
// angka ini gabungan part + labour, sudah dikurangi diskon). Sama pola
// dengan SummaryLabelWithTooltip di Admin/Dashboards/Part.jsx.
function ColumnHeaderWithTooltip({ label, tooltip }) {
    return (
        <span className="flex items-center gap-1">
            {label}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
            </Tooltip>
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
            { accessorKey: 'order_count', header: 'Orders', meta: { label: 'Orders' } },
            {
                accessorKey: 'revenue_approved',
                header: () => (
                    <ColumnHeaderWithTooltip
                        label="Revenue Approved"
                        tooltip="Total revenue from items approved by the customer — combined Part + Labour, after each discount is applied."
                    />
                ),
                meta: { label: 'Revenue Approved' },
                cell: ({ row }) => formatCurrency(row.original.revenue_approved),
            },
            {
                accessorKey: 'revenue_rejected',
                header: () => (
                    <ColumnHeaderWithTooltip
                        label="Revenue Rejected"
                        tooltip="Total potential revenue from items rejected by the customer — combined Part + Labour, after each discount is applied."
                    />
                ),
                meta: { label: 'Revenue Rejected' },
                cell: ({ row }) => formatCurrency(row.original.revenue_rejected),
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
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                enableHiding: false,
                meta: { label: 'Actions' },
                // Reuse Admin/ServiceOrders/Index.jsx yang sudah ada (search,
                // sort, pagination, filter) lewat query filter service_advisor_id
                // — bukan bikin halaman detail SA baru. Catatan: ServiceOrderController::index()
                // perlu ditambah `->when($request->service_advisor_id, ...)`.
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
            <TooltipProvider delayDuration={200}>
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
            </TooltipProvider>

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
                    />
                }
            />
        </AdminLayout>
    );
}