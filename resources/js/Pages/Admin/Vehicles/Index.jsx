import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm } from '@inertiajs/react';
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
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableSearchInput } from '@/Components/DataTable/DataTableSearchInput';

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
            // Kalau yang di-uncheck adalah primary saat ini, primary jadi kosong —
            // user wajib pilih ulang primary dari sisa customer yang ada.
            if (primaryCustomerId === customerId) {
                nextPrimary = nextIds[0] ?? '';
            }
        } else {
            nextIds = [...customerIds, customerId];
            // Customer pertama yang dipilih otomatis jadi primary default,
            // supaya user tidak wajib buka dropdown primary kalau cuma 1 PIC.
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

function VehicleFormDialog({ open, onOpenChange, vehicle, customers, brands, onSuccess }) {
    const isEdit = Boolean(vehicle);

    // vehicle.customers = daftar PIC lengkap (dari relasi belongsToMany, prop dikirim
    // controller index() lewat with(['customer', 'customers'])). Kalau prop ini belum
    // di-eager-load di baris tertentu (seharusnya selalu ada), fallback ke customer primary saja.
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
        year: vehicle?.year ?? '',
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
                year: vehicle?.year ?? '',
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
            },
        };

        if (isEdit) {
            put(route('admin.vehicles.update', vehicle.id), options);
        } else {
            post(route('admin.vehicles.store'), options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? 'Update vehicle details below.'
                                : 'Fill in the details for the new vehicle.'}
                        </DialogDescription>
                    </DialogHeader>

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
                                onChange={(e) => setData('plate_number', e.target.value)}
                                placeholder="B 1234 XYZ"
                            />
                            {errors.plate_number && (
                                <p className="text-sm text-urgent">{errors.plate_number}</p>
                            )}
                        </div>

                        {/* Brand enum terbatas (Audi, VW) — sesuai PROJECT-RULES.md bagian 2 */}
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

                        {/* VIN/Chasis Number (nama kolom DB tetap: vin) wajib unique, CHAR(17) */}
                        <div className="space-y-1.5">
                            <Label htmlFor="vin">VIN/Chasis Number</Label>
                            <Input
                                id="vin"
                                value={data.vin}
                                onChange={(e) => setData('vin', e.target.value.toUpperCase())}
                                placeholder="17-character VIN/Chasis Number"
                                maxLength={17}
                                className="uppercase"
                            />
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

                        <div className="space-y-1.5">
                            <Label htmlFor="year">Year (optional)</Label>
                            <Input
                                id="year"
                                type="number"
                                value={data.year}
                                onChange={(e) => setData('year', e.target.value)}
                                placeholder="2023"
                            />
                            {errors.year && <p className="text-sm text-urgent">{errors.year}</p>}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={processing}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Vehicle'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, vehicle }) {
    const { delete: destroy, processing } = useForm({});

    const handleDelete = () => {
        destroy(route('admin.vehicles.destroy', vehicle.id), {
            preserveScroll: true,
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Vehicle</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete{' '}
                        <strong>{vehicle?.plate_number}</strong>? This will also affect related
                        service orders. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={processing}>
                        {processing ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function Index({ vehicles, search, customers, brands }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [formOpen, setFormOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [deletingVehicle, setDeletingVehicle] = useState(null);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchTerm !== (search ?? '')) {
                router.get(
                    route('admin.vehicles.index'),
                    { search: searchTerm || undefined },
                    { preserveState: true, replace: true }
                );
            }
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

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
                accessorKey: 'year',
                header: 'Year',
                meta: { label: 'Year' },
                cell: ({ row }) => row.original.year ?? '—',
            },
            {
                // Ganti dari kolom 'customer' tunggal ke daftar semua PIC (relasi customers()),
                // supaya list vehicle langsung menunjukkan siapa saja PIC-nya, bukan cuma primary.
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
                                <Badge
                                    key={customer.id}
                                    variant={customer.pivot?.is_primary ? 'default' : 'secondary'}
                                >
                                    {customer.name}
                                    {customer.pivot?.is_primary && (
                                        <span className="ml-1 text-[10px] opacity-80">Primary</span>
                                    )}
                                </Badge>
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
                            onClick={() => setDeletingVehicle(row.original)}
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

    const table = useDataTable({ data: vehicles.data, columns });

    return (
        <AdminLayout title="Vehicles">
            <DataTable
                table={table}
                links={vehicles.links}
                emptyMessage="No vehicles found."
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by plate, VIN/chasis number, model, or customer..."
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