import { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm, Link, Head } from '@inertiajs/react';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/Components/ui/sheet';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Checkbox } from '@/Components/ui/checkbox';
import { Badge } from '@/Components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/Components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/Components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/Components/ui/dialog';
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

/**
 * Multi-select customer + penanda primary.
 * - customer_ids: array of number
 * - primary_customer_id: number|'' — HARUS salah satu dari customer_ids
 *   (dijaga di sini + divalidasi ulang di backend, lihat VehicleController::validateVehicle()).
 */
function CustomerMultiSelect({ customers, customerIds, primaryCustomerId, onChange, error, primaryError }) {
    const [popoverOpen, setPopoverOpen] = useState(false);

    const selectedCustomers = useMemo(
        () => customers.filter((c) => customerIds.includes(c.id)),
        [customers, customerIds]
    );

    const toggleCustomer = (customerId) => {
        let nextIds;
        let nextPrimary = primaryCustomerId;

        if (customerIds.includes(customerId)) {
            nextIds = customerIds.filter((id) => id !== customerId);
            if (primaryCustomerId === customerId) {
                nextPrimary = nextIds[0] ?? '';
            }
        } else {
            nextIds = [...customerIds, customerId];
            if (!primaryCustomerId) {
                nextPrimary = customerId;
            }
        }

        onChange(nextIds, nextPrimary);
    };

    const removeCustomer = (customerId) => toggleCustomer(customerId);

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label>Customers (PIC)</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start font-normal"
                        >
                            {customerIds.length > 0
                                ? `${customerIds.length} customer${customerIds.length > 1 ? 's' : ''} selected`
                                : 'Select customers'}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                            <CommandInput placeholder="Search customer..." />
                            <CommandList>
                                <CommandEmpty>No customer found.</CommandEmpty>
                                <CommandGroup>
                                    {customers.map((customer) => (
                                        <CommandItem
                                            key={customer.id}
                                            onSelect={() => toggleCustomer(customer.id)}
                                            className="cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={customerIds.includes(customer.id)}
                                                className="mr-2"
                                                onCheckedChange={() => toggleCustomer(customer.id)}
                                            />
                                            {customer.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                {error && <p className="text-sm text-urgent">{error}</p>}
            </div>

            {selectedCustomers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedCustomers.map((customer) => (
                        <Badge key={customer.id} variant="secondary" className="gap-1">
                            {customer.name}
                            {customer.id === primaryCustomerId && (
                                <span className="text-vw-light-blue">(Primary)</span>
                            )}
                            <button
                                type="button"
                                onClick={() => removeCustomer(customer.id)}
                                className="ml-1 text-muted-foreground hover:text-urgent"
                                aria-label={`Remove ${customer.name}`}
                            >
                                ×
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            {customerIds.length > 1 && (
                <div className="space-y-1.5">
                    <Label htmlFor="primary_customer_id">Primary Customer</Label>
                    <Select
                        value={primaryCustomerId ? String(primaryCustomerId) : ''}
                        onValueChange={(value) => onChange(customerIds, Number(value))}
                    >
                        <SelectTrigger id="primary_customer_id">
                            <SelectValue placeholder="Select primary customer" />
                        </SelectTrigger>
                        <SelectContent>
                            {selectedCustomers.map((customer) => (
                                <SelectItem key={customer.id} value={String(customer.id)}>
                                    {customer.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {primaryError && <p className="text-sm text-urgent">{primaryError}</p>}
                </div>
            )}
        </div>
    );
}

/**
 * Form Add/Edit Vehicle — MIGRASI ke pola Dialog (desktop) / Sheet bottom
 * (mobile), sama seperti CustomerFormDialog & UserFormDialog. Breakpoint
 * pakai useMediaQuery('(min-width: 640px)') konsisten dengan 2 halaman lain.
 */
function VehicleFormDialog({ open, onOpenChange, vehicle, customers, brands, onSuccess }) {
    const isEdit = Boolean(vehicle);

    // isDesktopLive ikut berubah kapan saja layar di-resize (DevTools
    // dibuka/tutup, zoom, dsb). Kalau dipakai langsung, dialog yang lagi
    // kebuka bisa tiba-tiba "loncat" dari Dialog ke Sheet atau sebaliknya
    // di tengah interaksi user — karena root Radix-nya beda total begitu
    // render cabang if/else berubah. Fix: snapshot nilainya HANYA saat
    // dialog baru dibuka (open: false -> true), lalu kunci selama dialog
    // masih terbuka.
    const isDesktopLive = useMediaQuery('(min-width: 640px)');
    const [isDesktop, setIsDesktop] = useState(isDesktopLive);
    useEffect(() => {
        if (open) {
            setIsDesktop(isDesktopLive);
        }
    }, [open]);

    const initialCustomerIds = () =>
        (vehicle?.customers ?? (vehicle?.customer ? [vehicle.customer] : [])).map((c) => c.id);

    const initialPrimaryId = () => {
        const primary = (vehicle?.customers ?? []).find((c) => c.pivot?.is_primary);
        return primary?.id ?? vehicle?.customer?.id ?? '';
    };

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        customer_ids: initialCustomerIds(),
        primary_customer_id: initialPrimaryId(),
        plate_number: vehicle?.plate_number ?? '',
        brand: vehicle?.brand ?? '',
        vin: vehicle?.vin ?? '',
        model: vehicle?.model ?? '',
    });

    useEffect(() => {
        if (open) {
            clearErrors();
            setData({
                customer_ids: initialCustomerIds(),
                primary_customer_id: initialPrimaryId(),
                plate_number: vehicle?.plate_number ?? '',
                brand: vehicle?.brand ?? '',
                vin: vehicle?.vin ?? '',
                model: vehicle?.model ?? '',
            });
        }
    }, [open, vehicle]);

    const handleCustomerChange = (customerIds, primaryCustomerId) => {
        setData((current) => ({
            ...current,
            customer_ids: customerIds,
            primary_customer_id: primaryCustomerId,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onOpenChange(false);
                onSuccess?.();
                toast.success(
                    isEdit ? 'Vehicle updated' : 'Vehicle added',
                    {
                        description: isEdit
                            ? `${data.plate_number} has been updated.`
                            : `${data.plate_number} has been added to the fleet.`,
                    }
                );
            },
            onError: () => {
                toast.error('Failed to save vehicle', {
                    description: 'Please check the form for errors and try again.',
                });
            },
        };

        if (isEdit) {
            put(route('admin.vehicles.update', vehicle.id), options);
        } else {
            post(route('admin.vehicles.store'), options);
        }
    };

    const formFields = (
        <div className="space-y-4 py-4">
            <CustomerMultiSelect
                customers={customers}
                customerIds={data.customer_ids}
                primaryCustomerId={data.primary_customer_id}
                onChange={handleCustomerChange}
                error={errors.customer_ids}
                primaryError={errors.primary_customer_id}
            />

            <div className="space-y-1.5">
                <Label htmlFor="plate_number">Plate Number</Label>
                <Input
                    id="plate_number"
                    value={data.plate_number}
                    onChange={(e) => setData('plate_number', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    placeholder="B1234XYZ"
                />
                {errors.plate_number && (
                    <p className="text-sm text-urgent">{errors.plate_number}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="brand">Brand</Label>
                <Select
                    value={data.brand || ''}
                    onValueChange={(value) => setData('brand', value)}
                >
                    <SelectTrigger id="brand">
                        <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                        {brands.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                                {brand}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.brand && <p className="text-sm text-urgent">{errors.brand}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="vin">VIN/Chasis Number</Label>
                <Input
                    id="vin"
                    value={data.vin}
                    onChange={(e) => setData('vin', e.target.value.toUpperCase())}
                    placeholder="17-character VIN/Chasis Number"
                    className="uppercase"
                />
                <p className={`text-xs ${!data.vin || data.vin.length === 17 ? 'text-gray-600' : 'text-urgent'}`}>
                    {data.vin.length}/17 characters
                </p>
                {errors.vin && <p className="text-sm text-urgent">{errors.vin}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <Input
                    id="model"
                    value={data.model}
                    onChange={(e) => setData('model', e.target.value)}
                    placeholder="Tiguan"
                />
                {errors.model && <p className="text-sm text-urgent">{errors.model}</p>}
            </div>
        </div>
    );

    const formActions = (
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
            <Button type="submit" disabled={processing} className="flex-1 sm:flex-none">
                {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Vehicle'}
            </Button>
        </>
    );

    const title = isEdit ? 'Edit Vehicle' : 'Add Vehicle';
    const description = isEdit
        ? 'Update vehicle details below.'
        : 'Fill in the details for the new vehicle.';

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

/**
 * Delete confirmation — MIGRASI dari AlertDialog-only ke pola AlertDialog
 * (desktop) / Sheet bottom (mobile), sama seperti DeleteConfirmDialog di
 * Customers & Users.
 */
function DeleteConfirmDialog({ open, onOpenChange, vehicle }) {
    // Sama seperti VehicleFormDialog — kunci isDesktop saat dialog dibuka
    // supaya tidak loncat komponen (AlertDialog <-> Sheet) di tengah jalan
    // kalau layar di-resize selagi dialog kebuka.
    const isDesktopLive = useMediaQuery('(min-width: 640px)');
    const [isDesktop, setIsDesktop] = useState(isDesktopLive);
    useEffect(() => {
        if (open) {
            setIsDesktop(isDesktopLive);
        }
    }, [open]);

    const { delete: destroy, processing } = useForm({});

    const handleDelete = () => {
        destroy(route('admin.vehicles.destroy', vehicle.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (page.props.flash?.error) {
                    toast.error('Failed to delete vehicle', { description: page.props.flash.error });
                    onOpenChange(false);
                    return;
                }
                onOpenChange(false);
                toast.success('Vehicle deleted', {
                    description: `${vehicle?.plate_number} has been removed.`,
                });
            },
            onError: () => {
                toast.error('Failed to delete vehicle', {
                    description: 'This vehicle may still be linked to active service orders.',
                });
            },
        });
    };

    const title = 'Delete Vehicle';
    const description = (
        <>
            Are you sure you want to delete <strong>{vehicle?.plate_number}</strong>? Vehicles that still have service orders cannot be deleted. This action cannot be undone.
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

// Definisi filter panel Vehicles — brand: select dari enum Vehicle::BRANDS,
// year: number (exact atau range, dipilih user lewat toggle di panel).
const buildFilterDefs = (brands) => [
    {
        key: 'brand',
        label: 'Brand',
        type: 'select',
        options: brands,
    },
];

export default function Index({ vehicles, search, filters, customers, brands }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        brand: filters?.brand ?? '',
    }));
    const [sorting, setSorting] = useState(() =>
        filters?.sort_by ? [{ id: filters.sort_by, desc: filters.sort_dir === 'desc' }] : []
    );
    const [formOpen, setFormOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [deletingVehicle, setDeletingVehicle] = useState(null);

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));

        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    const filterDefs = useMemo(() => buildFilterDefs(brands), [brands]);

    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            const activeSort = sorting[0];
            router.get(
                route('admin.vehicles.index'),
                {
                    search: searchTerm || undefined,
                    brand: activeFilters.brand || undefined,
                    sort_by: activeSort?.id || undefined,
                    sort_dir: activeSort ? (activeSort.desc ? 'desc' : 'asc') : undefined,
                },
                {
                    preserveState: true,
                    replace: true,
                }
            );
        }, 400);

        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters, sorting]);

    const handleFilterChange = (key, value) => {
        setActiveFilters((current) => ({ ...current, [key]: value }));
    };

    const handleFilterClear = () => {
        setActiveFilters({ brand: '' });
    };

    const openAddForm = () => {
        setEditingVehicle(null);
        setFormOpen(true);
    };

    const openEditForm = (vehicle) => {
        setEditingVehicle(vehicle);
        setFormOpen(true);
    };

    const columns = useMemo(
        () => [
            {
                accessorKey: 'plate_number',
                header: 'Plate Number',
                meta: { label: 'Plate Number' },
                cell: ({ row }) => (
                    <span className="font-medium">{row.original.plate_number}</span>
                ),
            },
            {
                id: 'brand_model',
                header: 'Brand / Model',
                meta: { label: 'Brand / Model' },
                accessorFn: (row) => `${row.brand} ${row.model}`,
            },
            {
                accessorKey: 'vin',
                header: 'VIN/Chasis Number',
                meta: { label: 'VIN/Chasis Number' },
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.vin ?? '—'}</span>
                ),
            },
            {
                id: 'customers',
                header: 'Customers (PIC)',
                meta: { label: 'Customers (PIC)' },
                enableSorting: false,
                accessorFn: (row) =>
                    (row.customers ?? []).map((c) => c.name).join(', '),
                cell: ({ row }) => {
                    const customerList = row.original.customers ?? [];
                    if (customerList.length === 0) return '—';
                    return (
                        <div className="flex flex-wrap gap-1">
                            {customerList.map((customer) => (
                                <Link
                                    key={customer.id}
                                    href={route('admin.vehicle-customers.index', {
                                        search: row.original.plate_number,
                                    })}
                                    className="transition-opacity hover:opacity-80"
                                >
                                    <Badge variant={customer.pivot?.is_primary ? 'default' : 'secondary'}>
                                        {customer.name}
                                        {customer.pivot?.is_primary && (
                                            <span className="ml-1 text-[10px] opacity-80">Primary</span>
                                        )}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                enableHiding: false,
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                            type="button"
                            onClick={() => openEditForm(row.original)}
                            className="inline-flex min-h-[36px] items-center px-2 text-sm font-medium text-vw-light-blue hover:underline"
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeletingVehicle(row.original)}
                            className="inline-flex min-h-[36px] items-center px-2 text-sm font-medium text-urgent hover:underline"
                        >
                            Delete
                        </button>
                    </div>
                ),
            },
        ],
        []
    );

    const table = useDataTable({
        data: vehicles.data,
        columns,
        manualSorting: true,
        sorting,
        onSortingChange: setSorting,
    });

    return (
        <AdminLayout title="Vehicles">
            <Head title="Vehicles" />
            <DataTable
                table={table}
                links={vehicles.links}
                emptyMessage="No vehicles found."
                isLoading={isLoading}
                isFiltered={Boolean(searchTerm || activeFilters.brand)}
                paginationMeta={{ from: vehicles.from, to: vehicles.to, total: vehicles.total }}
                onRowClick={openEditForm}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by plate, VIN/chasis number, model, or customer..."
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
                primaryAction={<Button onClick={openAddForm}>Add Vehicle</Button>}
            />

            <VehicleFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                vehicle={editingVehicle}
                customers={customers}
                brands={brands}
            />

            <DeleteConfirmDialog
                open={Boolean(deletingVehicle)}
                onOpenChange={(v) => !v && setDeletingVehicle(null)}
                vehicle={deletingVehicle}
            />
        </AdminLayout>
    );
}