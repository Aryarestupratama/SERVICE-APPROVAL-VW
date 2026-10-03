import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Link, router, Head, usePage } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Input } from '@/Components/ui/input';
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

// Timezone Asia/Jakarta konsisten dengan konvensi project (lihat
// PROJECT-RULES.md) — dipakai juga untuk kolom "Created At" ini supaya
// tanggal yang tampil ke admin/SA tidak bergeser gara-gara timezone device.
function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

// Dialog konfirmasi hapus — dipisah jadi komponen sendiri di file yang sama
// (bukan file terpisah) karena state-nya (order mana yang mau dihapus) perlu
// diangkat ke level Index, tidak bisa dikelola per-baris independen (row cell
// tidak boleh punya state sendiri yang lepas dari row yang lain kalau mau
// pola "1 dialog dipakai ulang untuk semua baris").
function DeleteServiceOrderDialog({ order, open, onOpenChange }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const expected = String(order?.work_order_number ?? order?.id ?? '');

    useEffect(() => {
        if (open) setConfirmText('');
    }, [open]);

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
                <div className="space-y-1.5">
                    <label htmlFor="confirm-delete-wo" className="text-sm text-foreground">
                        Type <span className="font-semibold">{expected}</span> to confirm
                    </label>
                    <Input
                        id="confirm-delete-wo"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={expected}
                        autoComplete="off"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting || confirmText.trim() !== expected}
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
            header: 'WO Number',
            meta: { label: 'WO Number' },
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
            header: 'Estimated Total',
            meta: { label: 'Estimated Total', align: 'right' },
            accessorFn: (row) => Number(row.grand_total_estimate),
            cell: ({ row }) => (
                <div className="text-right tabular-nums">{formatCurrency(row.original.grand_total_estimate)}</div>
            ),
        },
        {
            id: 'grand_total_approved',
            header: 'Confirmed Total',
            meta: { label: 'Confirmed Total', align: 'right' },
            accessorFn: (row) => Number(row.grand_total_approved),
            cell: ({ row }) => (
                <div className="text-right font-medium tabular-nums text-approved">
                    {formatCurrency(row.original.grand_total_approved)}
                </div>
            ),
        },
        {
            accessorKey: 'created_at',
            header: 'Created At',
            meta: { label: 'Created At' },
            cell: ({ row }) => (
                <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
            ),
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
                <div className="flex items-center justify-end gap-2">
                    <Link
                        href={route('admin.service-orders.show', row.original.id)}
                        className="inline-flex min-h-[36px] items-center px-1 text-sm font-medium text-vw-light-blue hover:underline"
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
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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

// Filter Grand Total (estimate/approved, exact/range) DIHAPUS (2026-09-20) —
// sebelumnya field 'grand_total_field' selalu default 'estimate' aktif terus
// tanpa benar-benar dipakai user sebagai filter aktif. Sisa filter cuma
// Status & Items Approval.
const filterDefs = [
    {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
    },
    {
        key: 'items_approval_status',
        label: 'Items Approval',
        type: 'select',
        options: Object.entries(ITEMS_APPROVAL_LABEL).map(([value, label]) => ({ value, label })),
    },
];

export default function Index({ orders, search, filters }) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        status: filters?.status ?? '',
        items_approval_status: filters?.items_approval_status ?? '',
    }));

    // Filter dari Dashboard SA (?service_advisor_id=…): dibawa terus di setiap request, bukan hilang saat user mengetik/mengurutkan.
    const [saFilter, setSaFilter] = useState(filters?.service_advisor_id ?? '');

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
            const activeSort = sorting[0];

            const nextParams = {
                search: searchTerm || undefined,
                status: activeFilters.status || undefined,
                items_approval_status: activeFilters.items_approval_status || undefined,
                service_advisor_id: saFilter || undefined,
                sort_by: activeSort?.id || undefined,
                sort_dir: activeSort ? (activeSort.desc ? 'desc' : 'asc') : undefined,
            };

            router.get(route('admin.service-orders.index'), nextParams, {
                preserveState: true,
                replace: true,
            });
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters, sorting, saFilter]);

    const handleFilterChange = (key, value) => {
        setActiveFilters((current) => ({ ...current, [key]: value }));
    };

    const handleFilterClear = () => {
        setActiveFilters({
            status: '',
            items_approval_status: '',
        });
    };

    return (
        <AdminLayout title="Service Orders">
            <Head title="Service Orders" />
            {saFilter && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-vw-blue/20 bg-vw-blue/[0.06] px-3 py-2 text-sm">
                    <span>
                        Showing orders for service advisor{' '}
                        <strong>{orders.data[0]?.service_advisor?.name ?? `#${saFilter}`}</strong>
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSaFilter('')}>
                        Show all advisors
                    </Button>
                </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
                {[{ value: '', label: 'All' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))].map((opt) => {
                    const active = activeFilters.status === opt.value;
                    return (
                        <button
                            key={opt.value || 'all'}
                            type="button"
                            aria-pressed={active}
                            onClick={() => handleFilterChange('status', opt.value)}
                            className={`min-h-[36px] rounded-full border px-3 text-sm transition-colors ${
                                active
                                    ? 'border-vw-blue bg-vw-blue text-white'
                                    : 'border-vw-grey/30 bg-white text-gray-700 hover:bg-vw-grey-light'
                            }`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            <DataTable
                table={table}
                links={orders.links}
                emptyMessage="No service orders yet."
                isLoading={isLoading}
                isFiltered={Boolean(searchTerm || saFilter || activeFilters.status || activeFilters.items_approval_status)}
                paginationMeta={{ from: orders.from, to: orders.to, total: orders.total }}
                onRowClick={(order) => router.visit(route('admin.service-orders.show', order.id))}
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
                        table={table}
                    />
                }
                primaryAction={
                    <Button asChild>
                        <Link href={route('admin.service-orders.create')}>Add Service Order</Link>
                    </Button>
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