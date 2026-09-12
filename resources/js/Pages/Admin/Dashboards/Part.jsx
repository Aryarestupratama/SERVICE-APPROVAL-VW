import { useMemo } from 'react';
import { Head } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
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

// Label kartu ringkasan + icon Info + Tooltip penjelas — dipakai bareng oleh
// kartu Revenue Approved & Revenue Rejected (sama-sama butuh disclaimer
// bahwa angka ini gabungan part + labour, sudah dikurangi diskon).
function SummaryLabelWithTooltip({ label, tooltip }) {
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

export default function Part({ partStats, summary }) {
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
                meta: { label: 'Times Added' },
            },
            {
                accessorKey: 'revenue',
                header: 'Revenue',
                meta: { label: 'Revenue' },
                cell: ({ row }) => formatCurrency(row.original.revenue),
            },
            {
                accessorKey: 'approved_count',
                header: 'Approved',
                meta: { label: 'Approved' },
            },
            {
                accessorKey: 'rejected_count',
                header: 'Rejected',
                meta: { label: 'Rejected' },
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

    // partStats hasil paginate() dari backend (bentuk { data, links, ... })
    // supaya DataTablePagination bisa jalan sama seperti halaman admin lain.
    const table = useDataTable({ data: partStats.data, columns });

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
                                    tooltip="Total revenue from items approved by the customer — combined Part + Labour, after each discount is applied."
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
                                    tooltip="Total potential revenue from items rejected by the customer — combined Part + Labour, after each discount is applied."
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
                            <p className="text-lg font-semibold">{summary.most_rejected_name}</p>
                        </CardContent>
                    </Card>
                </div>
            </TooltipProvider>

            <DataTable
                table={table}
                links={partStats.links}
                emptyMessage="No part data yet."
            />
        </AdminLayout>
    );
}