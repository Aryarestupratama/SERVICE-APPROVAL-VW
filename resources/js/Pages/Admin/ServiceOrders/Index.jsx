import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Link, router, Head, usePage } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
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

// Dialog konfirmasi hapus — dipisah jadi komponen sendiri di file yang sama
// (bukan file terpisah) karena state-nya (order mana yang mau dihapus) perlu
// diangkat ke level Index, tidak bisa dikelola per-baris independen (row cell
// tidak boleh punya state sendiri yang lepas dari row yang lain kalau mau
// pola "1 dialog dipakai ulang untuk semua baris").
function DeleteServiceOrderDialog({ order, open, onOpenChange }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = () => {
        setIsDeleting(true);
        router.delete(route('admin.service-orders.destroy', order.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (page.props.flash?.error) {
                    toast.error(page.props.flash.error);
                } else {
                    toast.success('Service order berhasil dihapus permanen.');
                }
                onOpenChange(false);
            },
            onError: () => {
                toast.error('Gagal menghapus service order.');
            },
            onFinish: () => setIsDeleting(false),
        });
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this service order?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete WO{' '}
                        <span className="font-medium text-foreground">
                            {order?.work_order_number}
                        </span>{' '}
                        and all its related data (inspection items, videos, estimation
                        documents, invoice, payment receipts). This action cannot be
                        undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// columns didefinisikan sebagai fungsi (bukan konstanta statis di top-level
// seperti sebelumnya) karena kolom 'actions' sekarang butuh tahu role user
// (buat show/hide tombol Delete) dan handler buka dialog — keduanya cuma
// tersedia di dalam komponen Index, tidak bisa diakses dari luar function.
function buildColumns({ isAdmin, onRequestDelete }) {
    return [
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
            enableSorting: false,
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
            enableSorting: false,
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
        {
            id: 'grand_total_estimate',
            header: 'Grand Total',
            meta: { label: 'Grand Total' },
            accessorFn: (row) => Number(row.grand_total_estimate),
            cell: ({ row }) => (
                <div className="text-right">{formatCurrency(row.original.grand_total_estimate)}</div>
            ),
        },
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
                <div className="flex items-center justify-end gap-3">
                    <Link
                        href={route('admin.service-orders.show', row.original.id)}
                        className="text-sm font-medium text-vw-light-blue hover:underline"
                    >
                        View
                    </Link>
                    {/* Delete cuma dirender untuk admin — SA tidak punya akses
                        sama sekali di route-nya juga (dipisah dari resource
                        service-orders di web.php), ini lapisan UX tambahan
                        supaya SA tidak lihat tombol yang bakal 403 kalau
                        dipencet. */}
                    {isAdmin && (
                        <button
                            type="button"
                            onClick={() => onRequestDelete(row.original)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label={`Delete WO ${row.original.work_order_number}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ),
        },
    ];
}

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
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

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

    const [sorting, setSorting] = useState(() =>
        filters?.sort_by
            ? [{ id: filters.sort_by, desc: filters.sort_dir === 'desc' }]
            : []
    );

    const [isLoading, setIsLoading] = useState(false);

    // State dialog delete — 1 dialog dipakai ulang untuk semua baris,
    // 'orderToDelete' menyimpan row mana yang lagi mau dihapus (null = dialog
    // tertutup).
    const [orderToDelete, setOrderToDelete] = useState(null);

    const columns = buildColumns({
        isAdmin,
        onRequestDelete: (order) => setOrderToDelete(order),
    });

    const table = useDataTable({
        data: orders.data,
        columns,
        manualSorting: true,
        sorting,
        onSortingChange: setSorting,
    });

    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));

        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            const gt = activeFilters.grand_total ?? emptyGrandTotalFilter;
            const activeSort = sorting[0];

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
                sort_by: activeSort?.id || undefined,
                sort_dir: activeSort ? (activeSort.desc ? 'desc' : 'asc') : undefined,
            };

            router.get(route('admin.service-orders.index'), nextParams, {
                preserveState: true,
                replace: true,
            });
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters, sorting]);

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
            <Head title="Service Orders" />
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

            <DeleteServiceOrderDialog
                order={orderToDelete}
                open={orderToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setOrderToDelete(null);
                }}
            />
        </AdminLayout>
    );
}