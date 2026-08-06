import { useState, useEffect } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Link, router } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableSearchInput } from '@/Components/DataTable/DataTableSearchInput';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';

const STATUS_LABEL = {
    appointment: 'Appointment',
    work_in_progress: 'Work in Progress',
    quality_control: 'Quality Control',
    invoice_preparation: 'Invoice Preparation',
    completed: 'Completed',
    all_rejected_cancelled: 'Rejected & Cancelled',
};

const STATUS_VARIANT = {
    appointment: 'secondary',
    work_in_progress: 'default',
    quality_control: 'default',
    invoice_preparation: 'default',
    completed: 'success',
    all_rejected_cancelled: 'destructive',
};

const ITEMS_APPROVAL_LABEL = {
    pending: 'Pending',
    partially_approved: 'Partially Approved',
    approved: 'Approved',
    rejected: 'Rejected',
};

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value));
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
        cell: ({ row }) => (
            <Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>
                {STATUS_LABEL[row.original.status] ?? row.original.status}
            </Badge>
        ),
    },
    // Grand Total (estimasi) — live calc semua item apapun statusnya, PPN
    // rate sekarang. Formula identik InspectionItemPricingService::breakdownByGroup()
    // (di-sum lintas group), dihitung via subquery SQL di controller supaya
    // sort/filter/pagination tetap akurat lintas semua order (bukan cuma
    // 20 baris yang tampil).
    {
        id: 'grand_total_estimate',
        header: 'Grand Total',
        meta: { label: 'Grand Total' },
        accessorFn: (row) => Number(row.grand_total_estimate),
        cell: ({ row }) => (
            <div className="text-right">{formatCurrency(row.original.grand_total_estimate)}</div>
        ),
    },
    // Grand Total Approved — SUM final_price_snapshot, item approved saja.
    // Formula identik InspectionItemPricingService::grandTotalForOrder().
    {
        id: 'grand_total_approved',
        header: 'Grand Total Approved',
        meta: { label: 'Grand Total Approved' },
        accessorFn: (row) => Number(row.grand_total_approved),
        cell: ({ row }) => (
            <div className="text-right font-medium text-approved">
                {formatCurrency(row.original.grand_total_approved)}
            </div>
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

// Filter panel Service Orders — status & items_approval_status: select dari
// enum tetap; grand_total_field: pilih target (estimate/approved); grand_total:
// number (exact/range) mengacu ke field yang dipilih. Pola number identik
// dengan year di Admin/Vehicles/Index.jsx (PROJECT-RULES bagian 10.5).
const filterDefs = [
    {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: Object.keys(STATUS_LABEL),
    },
    {
        key: 'items_approval_status',
        label: 'Items Approval',
        type: 'select',
        options: Object.keys(ITEMS_APPROVAL_LABEL),
    },
    {
        key: 'grand_total_field',
        label: 'Grand Total Type',
        type: 'select',
        options: ['estimate', 'approved'],
    },
    {
        key: 'grand_total',
        label: 'Grand Total',
        type: 'number',
        placeholder: 'e.g. 500000',
    },
];

const emptyGrandTotalFilter = { mode: 'exact', value: '', from: '', to: '' };

export default function Index({ orders, search, filters }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        status: filters?.status ?? '',
        items_approval_status: filters?.items_approval_status ?? '',
        grand_total_field: filters?.grand_total_field ?? 'estimate',
        grand_total:
            filters?.grand_total_from || filters?.grand_total_to
                ? {
                      mode: 'range',
                      value: '',
                      from: filters?.grand_total_from ?? '',
                      to: filters?.grand_total_to ?? '',
                  }
                : { mode: 'exact', value: filters?.grand_total_value ?? '', from: '', to: '' },
    }));

    const [isLoading, setIsLoading] = useState(false);

    const table = useDataTable({ data: orders.data, columns });

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

    // Search dan filter digabung jadi satu request/debounce — sama pola
    // dengan Admin/Vehicles/Index.jsx (PROJECT-RULES bagian 10.5).
    useEffect(() => {
        const timeout = setTimeout(() => {
            const gt = activeFilters.grand_total ?? emptyGrandTotalFilter;

            const nextParams = {
                search: searchTerm || undefined,
                status: activeFilters.status || undefined,
                items_approval_status: activeFilters.items_approval_status || undefined,
                grand_total_field:
                    activeFilters.grand_total_field !== 'estimate'
                        ? activeFilters.grand_total_field
                        : undefined,
                grand_total_value: gt.mode === 'exact' ? (gt.value || undefined) : undefined,
                grand_total_from: gt.mode === 'range' ? (gt.from || undefined) : undefined,
                grand_total_to: gt.mode === 'range' ? (gt.to || undefined) : undefined,
            };

            router.get(route('admin.service-orders.index'), nextParams, {
                preserveState: true,
                replace: true,
            });
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters]);

    const handleFilterChange = (key, value) => {
        setActiveFilters((current) => ({ ...current, [key]: value }));
    };

    const handleFilterClear = () => {
        setActiveFilters({
            status: '',
            items_approval_status: '',
            grand_total_field: 'estimate',
            grand_total: emptyGrandTotalFilter,
        });
    };

    return (
        <AdminLayout
            title="Service Orders"
            headerActions={
                <Button asChild>
                    <Link href={route('admin.service-orders.create')}>Add Service Order</Link>
                </Button>
            }
        >
            <DataTable
                table={table}
                links={orders.links}
                emptyMessage="No service orders yet."
                isLoading={isLoading}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search customer, WO number, plate number..."
                        isLoading={isLoading}
                    />
                }
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