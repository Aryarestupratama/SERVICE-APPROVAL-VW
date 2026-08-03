import AdminLayout from '@/Layouts/AdminLayout';
import { Link } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';

const STATUS_VARIANT = {
    appointment: 'secondary',
    work_in_progress: 'default',
    quality_control: 'default',
    invoice_preparation: 'default',
    completed: 'success',
    all_rejected_cancelled: 'destructive',
};

const STATUS_LABEL = {
    appointment: 'Appointment',
    work_in_progress: 'Work in Progress',
    quality_control: 'Quality Control',
    invoice_preparation: 'Invoice Preparation',
    completed: 'Completed',
    all_rejected_cancelled: 'Rejected & Cancelled',
};

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);
}

const columns = [
    {
        accessorKey: 'work_order_number',
        header: 'Work Order Number',
        meta: { label: 'Work Order Number' },
        cell: ({ row }) => (
            <span className="font-medium">{row.original.work_order_number}</span>
        ),
    },
    {
        id: 'customer',
        header: 'Customer',
        meta: { label: 'Customer' },
        accessorFn: (row) => row.vehicle?.customer?.name ?? '',
        cell: ({ row }) => (
            <span className="font-medium">{row.original.vehicle?.customer?.name ?? '—'}</span>
        ),
    },
    {
        id: 'vehicle',
        header: 'Vehicle',
        meta: { label: 'Vehicle' },
        enableSorting: false,
        accessorFn: (row) =>
            row.vehicle ? `${row.vehicle.brand} ${row.vehicle.model} ${row.vehicle.plate_number}` : '',
        cell: ({ row }) => {
            const v = row.original.vehicle;
            return v ? `${v.brand} ${v.model} · ${v.plate_number}` : '—';
        },
    },
    {
        id: 'service_advisor',
        header: 'Service Advisor',
        meta: { label: 'Service Advisor' },
        accessorFn: (row) => row.service_advisor?.name ?? '',
        cell: ({ row }) => row.original.service_advisor?.name ?? '—',
    },
    {
        accessorKey: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        filterFn: 'equals',
        cell: ({ row }) => (
            <Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>
                {STATUS_LABEL[row.original.status] ?? row.original.status}
            </Badge>
        ),
    },
    {
        accessorKey: 'inspection_fee',
        header: 'Inspection Fee',
        meta: { label: 'Inspection Fee' },
        cell: ({ row }) => (
            <div className="text-right">{formatCurrency(row.original.inspection_fee)}</div>
        ),
    },
    {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
            <Link
                href={route('admin.service-orders.show', row.original.id)}
                className="text-sm font-medium text-vw-light-blue hover:underline"
            >
                View
            </Link>
        ),
    },
];

export default function Index({ orders }) {
    const table = useDataTable({ data: orders.data, columns });

    const statusColumn = table.getColumn('status');
    const activeStatusFilter = statusColumn?.getFilterValue() ?? '';

    return (
        <AdminLayout title="Service Orders">
            <DataTable
                table={table}
                links={orders.links}
                emptyMessage="No service orders yet."
                searchPlaceholder="Search customer, WO number..."
                filterSlot={
                    <Select
                        value={activeStatusFilter || 'all'}
                        onValueChange={(value) =>
                            statusColumn?.setFilterValue(value === 'all' ? undefined : value)
                        }
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
                primaryAction={
                    <Button asChild>
                        <Link href={route('admin.service-orders.create')}>Add Service Order</Link>
                    </Button>
                }
            />
        </AdminLayout>
    );
}