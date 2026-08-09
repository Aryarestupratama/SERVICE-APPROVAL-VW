import { useEffect, useMemo, useState, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm, Head } from '@inertiajs/react';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/Components/ui/sheet';
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
    // isDesktopLive ikut berubah kapan saja layar di-resize (DevTools
    // dibuka/tutup, zoom, dsb). Kalau dipakai langsung, dialog yang lagi
    // kebuka bisa loncat dari Dialog ke Sheet (atau sebaliknya) di tengah
    // interaksi user, karena root Radix-nya beda total begitu cabang
    // if/else render berubah. Fix: snapshot nilainya HANYA saat dialog baru
    // dibuka (open: false -> true), lalu kunci selama dialog masih terbuka.
    // Sama pola dengan Customers/Vehicles/Users Index.jsx.
    const isDesktopLive = useMediaQuery('(min-width: 640px)');
    const [isDesktop, setIsDesktop] = useState(isDesktopLive);
    useEffect(() => {
        if (open) {
            setIsDesktop(isDesktopLive);
        }
    }, [open]);

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

    const formFields = (
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
    );

    const formActions = (
        <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing} className="flex-1 sm:flex-none">
                Cancel
            </Button>
            <Button type="submit" disabled={processing} className="flex-1 sm:flex-none">
                {processing ? 'Linking...' : 'Link Customer'}
            </Button>
        </>
    );

    const title = 'Link Customer to Vehicle';
    const description = 'Assigns a customer to a vehicle as PIC. Use "Set as Primary" afterwards if needed.';

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

function UnassignConfirmDialog({ open, onOpenChange, pivot }) {
    // Sama seperti AssignDialog — kunci isDesktop saat dialog dibuka supaya
    // tidak loncat komponen (AlertDialog <-> Sheet) di tengah jalan kalau
    // layar di-resize selagi dialog kebuka.
    const isDesktopLive = useMediaQuery('(min-width: 640px)');
    const [isDesktop, setIsDesktop] = useState(isDesktopLive);
    useEffect(() => {
        if (open) {
            setIsDesktop(isDesktopLive);
        }
    }, [open]);

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

    const title = 'Unassign Customer';
    const description = (
        <>
            Remove <strong>{pivot?.customer?.name}</strong> from{' '}
            <strong>{pivot?.vehicle?.plate_number}</strong>? This does not delete the
            customer or vehicle record.
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
                onClick={handleUnassign}
                disabled={processing}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:flex-none"
            >
                {processing ? 'Removing...' : 'Unassign'}
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

const ROLE_OPTIONS = ['Primary', 'PIC'];

export default function Index({ pivots, search, filters, vehicles, customers }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({ role: filters?.role ?? '' }));
    const [assignOpen, setAssignOpen] = useState(false);
    const [unassigning, setUnassigning] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Wiring isLoading ke DataTable — sama pola dengan Admin/Vehicles/Index.jsx
    // (PROJECT-RULES bagian 7, TODO "Wire prop isLoading"). Halaman ini di luar
    // scope TODO asli (cuma sebut Vehicles/Customers/Users/ServiceOrders), tapi
    // disamakan untuk konsistensi karena pakai DataTable yang sama.
    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));

        return () => {
            removeStart();
            removeFinish();
        };
    }, []);

    // Flag "sudah pernah mount belum" — useEffect di bawah selalu jalan sekali
    // saat render pertama juga (bukan cuma saat searchTerm/activeFilters
    // berubah dari interaksi user). Tanpa guard ini, tiap kali halaman dibuka
    // dari sidebar terjadi 2 request: (1) load awal dari Inertia visit, lalu
    // (2) request redundan dari effect ini 400ms kemudian dengan search/filter
    // yang isinya sama persis — terlihat seperti halaman "reload 2x". Sama
    // fix-nya dengan Vehicles/Customers/Users Index.jsx.
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

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
            <Head title="Vehicle Customer" />
            <DataTable
                table={table}
                links={pivots.links}
                emptyMessage="No customer-vehicle links found."
                isLoading={isLoading}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by customer name, plate, or VIN..."
                        isLoading={isLoading}
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