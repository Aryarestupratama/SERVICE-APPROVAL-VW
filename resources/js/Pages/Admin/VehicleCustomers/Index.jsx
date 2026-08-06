import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm } from '@inertiajs/react';
import { toast } from 'sonner';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Label } from '@/Components/ui/label';
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
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableSearchInput } from '@/Components/DataTable/DataTableSearchInput';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';

/** Single-select combobox generic — dipakai untuk pilih vehicle & customer di AssignDialog. */
function SingleSelectCombobox({ items, value, onChange, placeholder, getLabel }) {
    const [open, setOpen] = useState(false);
    const selected = items.find((i) => i.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-start font-normal">
                    {selected ? getLabel(selected) : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder={`Search...`} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {items.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    onSelect={() => {
                                        onChange(item.id);
                                        setOpen(false);
                                    }}
                                    className="cursor-pointer"
                                >
                                    {getLabel(item)}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function AssignDialog({ open, onOpenChange, vehicles, customers }) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        vehicle_id: '',
        customer_id: '',
    });

    useEffect(() => {
        if (open) {
            clearErrors();
            setData({ vehicle_id: '', customer_id: '' });
        }
    }, [open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        post(route('admin.vehicle-customers.store'), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onOpenChange(false);
                toast.success('Customer linked', {
                    description: 'The customer has been linked to the vehicle.',
                });
            },
            onError: () => {
                toast.error('Failed to link customer', {
                    description: 'Please check the form and try again.',
                });
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Link Customer to Vehicle</DialogTitle>
                        <DialogDescription>
                            Assigns a customer to a vehicle as PIC. Use "Set as Primary" afterwards if needed.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label>Vehicle</Label>
                            <SingleSelectCombobox
                                items={vehicles}
                                value={data.vehicle_id}
                                onChange={(id) => setData('vehicle_id', id)}
                                placeholder="Select vehicle"
                                getLabel={(v) => `${v.plate_number} — ${v.brand} ${v.model}`}
                            />
                            {errors.vehicle_id && <p className="text-sm text-urgent">{errors.vehicle_id}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label>Customer</Label>
                            <SingleSelectCombobox
                                items={customers}
                                value={data.customer_id}
                                onChange={(id) => setData('customer_id', id)}
                                placeholder="Select customer"
                                getLabel={(c) => c.name}
                            />
                            {errors.customer_id && <p className="text-sm text-urgent">{errors.customer_id}</p>}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Linking...' : 'Link Customer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function UnassignConfirmDialog({ open, onOpenChange, pivot }) {
    const { delete: destroy, processing } = useForm({});

    const handleUnassign = () => {
        destroy(route('admin.vehicle-customers.destroy', pivot.id), {
            preserveScroll: true,
            onSuccess: () => {
                onOpenChange(false);
                toast.success('Customer unassigned');
            },
            onError: () => {
                toast.error('Failed to unassign', {
                    description: 'This vehicle must keep at least one customer.',
                });
            },
        });
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Unassign Customer</AlertDialogTitle>
                    <AlertDialogDescription>
                        Remove <strong>{pivot?.customer?.name}</strong> from{' '}
                        <strong>{pivot?.vehicle?.plate_number}</strong>? This does not delete the
                        customer or vehicle record.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleUnassign(); }}
                        disabled={processing}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {processing ? 'Removing...' : 'Unassign'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const ROLE_OPTIONS = ['Primary', 'PIC'];

export default function Index({ pivots, search, filters, vehicles, customers }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({ role: filters?.role ?? '' }));
    const [assignOpen, setAssignOpen] = useState(false);
    const [unassigning, setUnassigning] = useState(null);

    useEffect(() => {
        const timeout = setTimeout(() => {
            router.get(
                route('admin.vehicle-customers.index'),
                {
                    search: searchTerm || undefined,
                    role: activeFilters.role ? activeFilters.role.toLowerCase() : undefined,
                },
                { preserveState: true, replace: true }
            );
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters]);

    const handleSetPrimary = (pivot) => {
        router.patch(route('admin.vehicle-customers.set-primary', pivot.id), {}, {
            preserveScroll: true,
            onSuccess: () => toast.success('Primary customer updated'),
            onError: () => toast.error('Failed to update primary customer'),
        });
    };

    const filterDefs = useMemo(() => [
        { key: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS },
    ], []);

    const columns = useMemo(() => [
        {
            id: 'vehicle',
            header: 'Vehicle',
            meta: { label: 'Vehicle' },
            accessorFn: (row) => row.vehicle?.plate_number,
            cell: ({ row }) => (
                <div>
                    <div className="font-medium">{row.original.vehicle?.plate_number}</div>
                    <div className="text-xs text-muted-foreground">
                        {row.original.vehicle?.brand} {row.original.vehicle?.model}
                    </div>
                </div>
            ),
        },
        {
            id: 'customer',
            header: 'Customer',
            meta: { label: 'Customer' },
            accessorFn: (row) => row.customer?.name,
        },
        {
            id: 'role',
            header: 'Role',
            meta: { label: 'Role' },
            cell: ({ row }) => (
                <Badge variant={row.original.is_primary ? 'default' : 'secondary'}>
                    {row.original.is_primary ? 'Primary' : 'PIC'}
                </Badge>
            ),
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
                <div className="space-x-3 whitespace-nowrap text-right">
                    {!row.original.is_primary && (
                        <button
                            type="button"
                            onClick={() => handleSetPrimary(row.original)}
                            className="text-sm font-medium text-vw-light-blue hover:underline"
                        >
                            Set as Primary
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setUnassigning(row.original)}
                        className="text-sm font-medium text-urgent hover:underline"
                    >
                        Unassign
                    </button>
                </div>
            ),
        },
    ], []);

    const table = useDataTable({ data: pivots.data, columns });

    return (
        <AdminLayout
            title="Vehicle Customer"
            headerActions={<Button onClick={() => setAssignOpen(true)}>Link Customer</Button>}
        >
            <DataTable
                table={table}
                links={pivots.links}
                emptyMessage="No customer-vehicle links found."
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by customer name, plate, or VIN..."
                    />
                }
                filterSlot={
                    <DataTableFilterPanel
                        filters={filterDefs}
                        values={activeFilters}
                        onChange={(key, value) => setActiveFilters((c) => ({ ...c, [key]: value }))}
                        onClear={() => setActiveFilters({ role: '' })}
                    />
                }
                primaryAction={<Button onClick={() => setAssignOpen(true)}>Link Customer</Button>}
            />

            <AssignDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                vehicles={vehicles}
                customers={customers}
            />

            <UnassignConfirmDialog
                open={Boolean(unassigning)}
                onOpenChange={(v) => !v && setUnassigning(null)}
                pivot={unassigning}
            />
        </AdminLayout>
    );
}