import { useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';

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

    const table = useDataTable({ data: partStats, columns });

    return (
        <AdminLayout title="Dashboard — Part">
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Parts Sold
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{summary.total_used}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {formatCurrency(summary.total_revenue)}
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

            <DataTable table={table} links={[]} emptyMessage="No part data yet." />
        </AdminLayout>
    );
}