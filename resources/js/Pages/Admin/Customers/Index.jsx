import { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm } from '@inertiajs/react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/Components/ui/sheet';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/Components/ui/dialog';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/Components/ui/alert-dialog';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableSearchInput } from '@/Components/DataTable/DataTableSearchInput';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';

// Terima input user dalam bentuk apapun (boleh diawali 0, 62, atau langsung tanpa awalan)
// dan kembalikan hanya bagian digit SETELAH kode negara, tanpa leading zero.
// Backend (mutator Customer::phone) yang bertanggung jawab menyatukan jadi "+62..." final.
function toLocalDigits(raw) {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('62')) {
        digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    return digits;
}

function PhoneInput({ id, value, onChange, error }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>Phone</Label>
            <div
                className={`flex min-w-0 items-center rounded-md border ${
                    error ? 'border-urgent' : 'border-input'
                } focus-within:ring-1 focus-within:ring-ring`}
            >
                <span className="shrink-0 select-none border-r border-input bg-vw-grey-light px-3 py-2 text-sm text-vw-grey">
                    +62
                </span>
                <Input
                    id={id}
                    type="tel"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => onChange(toLocalDigits(e.target.value))}
                    placeholder="8xxxxxxxxxx"
                    className="min-w-0 flex-1 border-0 focus-visible:ring-0"
                />
            </div>
            {error && <p className="text-sm text-urgent">{error}</p>}
        </div>
    );
}

function CustomerFormDialog({ open, onOpenChange, customer, onSuccess, titles }) {
    const isEdit = Boolean(customer);
    const isDesktop = useMediaQuery('(min-width: 640px)');
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        name: customer?.name ?? '',
        title: customer?.title ?? '',
        phone: customer ? toLocalDigits(customer.phone ?? '') : '',
        email: customer?.email ?? '',
    });

    useEffect(() => {
        if (open) {
            clearErrors();
            setData({
                name: customer?.name ?? '',
                title: customer?.title ?? '',
                phone: customer ? toLocalDigits(customer.phone ?? '') : '',
                email: customer?.email ?? '',
            });
        }
    }, [open, customer]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onOpenChange(false);
                onSuccess?.();
                toast.success(
                    isEdit ? 'Customer updated' : 'Customer added',
                    {
                        description: isEdit
                            ? `${data.name} has been updated.`
                            : `${data.name} has been added.`,
                    }
                );
            },
            onError: () => {
                toast.error('Failed to save customer', {
                    description: 'Please check the form for errors and try again.',
                });
            },
        };

        if (isEdit) {
            put(route('admin.customers.update', customer.id), options);
        } else {
            post(route('admin.customers.store'), options);
        }
    };

    const formFields = (
        <div className="space-y-4 py-4">
            <div className="space-y-1.5">
                <Label htmlFor="title">Prefix (optional)</Label>
                <Select value={data.title || undefined} onValueChange={(value) => setData('title', value)}>
                    <SelectTrigger id="title">
                        <SelectValue placeholder="Select prefix" />
                    </SelectTrigger>
                    <SelectContent>
                        {titles.map((title) => (
                            <SelectItem key={title} value={title}>
                                {title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.title && <p className="text-sm text-urgent">{errors.title}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                    id="name"
                    value={data.name}
                    onChange={(e) => setData('name', e.target.value)}
                    placeholder="Customer name"
                />
                {errors.name && <p className="text-sm text-urgent">{errors.name}</p>}
            </div>

            <PhoneInput id="phone" value={data.phone} onChange={(value) => setData('phone', value)} error={errors.phone} />

            <div className="space-y-1.5">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                    id="email"
                    type="email"
                    value={data.email}
                    onChange={(e) => setData('email', e.target.value)}
                    placeholder="customer@email.com"
                />
                {errors.email && <p className="text-sm text-urgent">{errors.email}</p>}
            </div>
        </div>
    );

    const formActions = (
        <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing} className="flex-1 sm:flex-none">
                Cancel
            </Button>
            <Button type="submit" disabled={processing} className="flex-1 sm:flex-none">
                {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Customer'}
            </Button>
        </>
    );

    const title = isEdit ? 'Edit Customer' : 'Add Customer';
    const description = isEdit ? 'Update customer details below.' : 'Fill in the details for the new customer.';

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{title}</DialogTitle>
                            <DialogDescription>{description}</DialogDescription>
                        </DialogHeader>
                        {formFields}
                        <DialogFooter>{formActions}</DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="flex max-h-[90vh] flex-col rounded-t-lg p-0">
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <SheetHeader className="shrink-0 border-b border-vw-grey/15 px-6 py-4 text-left">
                        <SheetTitle>{title}</SheetTitle>
                        <SheetDescription>{description}</SheetDescription>
                    </SheetHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-6">
                        {formFields}
                    </div>

                    <SheetFooter className="shrink-0 flex-row gap-3 border-t border-vw-grey/15 px-6 py-4">
                        {formActions}
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, customer }) {
    const isDesktop = useMediaQuery('(min-width: 640px)');
    const { delete: destroy, processing } = useForm({});

    const handleDelete = () => {
        destroy(route('admin.customers.destroy', customer.id), {
            preserveScroll: true,
            onSuccess: () => {
                onOpenChange(false);
                toast.success('Customer deleted', {
                    description: `${customer?.name} has been removed.`,
                });
            },
            onError: () => {
                toast.error('Failed to delete customer', {
                    description: 'This customer may still be linked to active vehicles or service orders.',
                });
            },
        });
    };

    const title = 'Delete Customer';
    const description = (
        <>
            Are you sure you want to delete <strong>{customer?.name}</strong>? This will also affect related
            vehicles and service orders. This action cannot be undone.
        </>
    );

    const actions = (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={processing}
                className="flex-1 sm:flex-none"
            >
                Cancel
            </Button>
            <Button
                type="button"
                onClick={handleDelete}
                disabled={processing}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:flex-none"
            >
                {processing ? 'Deleting...' : 'Delete'}
            </Button>
        </>
    );

    if (isDesktop) {
        return (
            <AlertDialog open={open} onOpenChange={onOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{title}</AlertDialogTitle>
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            disabled={processing}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {processing ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-lg">
                <SheetHeader className="text-left">
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <SheetFooter className="mt-5 flex-row gap-3">{actions}</SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

// Filter panel Customers — title: select dari Customer::TITLES (Mr./Mrs./Mss.).
// name/phone/email sudah cukup dicover global search server-side, tidak
// perlu filter terpisah (sesuai TODO bagian 7).
const buildFilterDefs = (titles) => [
    {
        key: 'title',
        label: 'Prefix',
        type: 'select',
        options: titles,
    },
];

export default function Index({ customers, search, filters, titles }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        title: filters?.title ?? '',
    }));
    const [formOpen, setFormOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [deletingCustomer, setDeletingCustomer] = useState(null);

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

    const filterDefs = useMemo(() => buildFilterDefs(titles), [titles]);

    // Flag "sudah pernah mount belum" — useEffect di bawah selalu jalan sekali
    // saat render pertama juga (bukan cuma saat searchTerm/activeFilters
    // berubah dari interaksi user). Tanpa guard ini, tiap kali halaman dibuka
    // dari sidebar terjadi 2 request: (1) load awal dari Inertia visit, lalu
    // (2) request redundan dari effect ini 400ms kemudian dengan search/filter
    // yang isinya sama persis — terlihat seperti halaman "reload 2x".
    const isFirstRender = useRef(true);

    // Search dan filter digabung jadi satu request/debounce — sama pola
    // dengan Admin/Vehicles/Index.jsx (PROJECT-RULES bagian 10.5).
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            const nextParams = {
                search: searchTerm || undefined,
                title: activeFilters.title || undefined,
            };

            router.get(route('admin.customers.index'), nextParams, {
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
        setActiveFilters({ title: '' });
    };

    const openAddForm = () => {
        setEditingCustomer(null);
        setFormOpen(true);
    };

    const openEditForm = (customer) => {
        setEditingCustomer(customer);
        setFormOpen(true);
    };

    const columns = useMemo(
        () => [
            {
                id: 'name',
                header: 'Name',
                meta: { label: 'Name' },
                accessorFn: (row) => row.name,
                cell: ({ row }) => (
                    <span className="font-medium">
                        {row.original.title ? `${row.original.title} ` : ''}
                        {row.original.name}
                    </span>
                ),
            },
            {
                accessorKey: 'phone',
                header: 'Phone',
                meta: { label: 'Phone' },
            },
            {
                accessorKey: 'email',
                header: 'Email',
                meta: { label: 'Email' },
                cell: ({ row }) => row.original.email ?? '—',
            },
            {
                id: 'vehicles',
                header: 'Vehicles',
                meta: { label: 'Vehicles' },
                accessorFn: (row) => row.vehicles?.length ?? 0,
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                enableHiding: false,
                cell: ({ row }) => (
                    <div className="space-x-3 whitespace-nowrap text-right">
                        <button
                            type="button"
                            onClick={() => openEditForm(row.original)}
                            className="text-sm font-medium text-vw-light-blue hover:underline"
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeletingCustomer(row.original)}
                            className="text-sm font-medium text-urgent hover:underline"
                        >
                            Delete
                        </button>
                    </div>
                ),
            },
        ],
        []
    );

    const table = useDataTable({ data: customers.data, columns });

    return (
        <AdminLayout
            title="Customers"
            headerActions={<Button onClick={openAddForm}>Add Customer</Button>}
        >
            <DataTable
                table={table}
                links={customers.links}
                emptyMessage="No customers found."
                isLoading={isLoading}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or phone..."
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

            <CustomerFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                customer={editingCustomer}
                titles={titles}
            />

            <DeleteConfirmDialog
                open={Boolean(deletingCustomer)}
                onOpenChange={(v) => !v && setDeletingCustomer(null)}
                customer={deletingCustomer}
            />
        </AdminLayout>
    );
}