import { useState, useEffect } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm, Link } from '@inertiajs/react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/Components/ui/table';
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

function VehicleFormDialog({ open, onOpenChange, vehicle, customers, brands, onSuccess }) {
    const isEdit = Boolean(vehicle);
    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        customer_id: vehicle?.customer_id ?? '',
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
                customer_id: vehicle?.customer_id ?? '',
                plate_number: vehicle?.plate_number ?? '',
                brand: vehicle?.brand ?? '',
                vin: vehicle?.vin ?? '',
                model: vehicle?.model ?? '',
                year: vehicle?.year ?? '',
            });
        }
    }, [open, vehicle]);

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
                        {/* Customer hanya bisa dipilih saat tambah baru — tidak ikut di-update saat edit,
                            karena controller update() tidak menerima customer_id.
                            "Edit vehicle: pindah customer" masih belum diputuskan owner. */}
                        {!isEdit && (
                            <div className="space-y-1.5">
                                <Label htmlFor="customer_id">Customer</Label>
                                <Select
                                    value={data.customer_id ? String(data.customer_id) : ''}
                                    onValueChange={(value) => setData('customer_id', value)}
                                >
                                    <SelectTrigger id="customer_id">
                                        <SelectValue placeholder="Select customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customers.map((customer) => (
                                            <SelectItem key={customer.id} value={String(customer.id)}>
                                                {customer.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.customer_id && (
                                    <p className="text-sm text-urgent">{errors.customer_id}</p>
                                )}
                            </div>
                        )}

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

                        {/* Brand sekarang enum terbatas (Audi, VW) — bukan free text lagi,
                            sesuai keputusan owner 2026-07-31 (bagian 7B PROJECT-RULES.md) */}
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

                        {/* VIN wajib unique, CHAR(17) — sesuai keputusan owner 2026-07-31 */}
                        <div className="space-y-1.5">
                            <Label htmlFor="vin">VIN</Label>
                            <Input
                                id="vin"
                                value={data.vin}
                                onChange={(e) => setData('vin', e.target.value.toUpperCase())}
                                placeholder="17-character VIN"
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

    return (
        <AdminLayout title="Vehicles">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by plate, VIN, model, or customer..."
                    className="max-w-xs"
                />
                <Button onClick={openAddForm}>Add Vehicle</Button>
            </div>

            <div className="rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Plate Number</TableHead>
                            <TableHead>Brand / Model</TableHead>
                            <TableHead>VIN</TableHead>
                            <TableHead>Year</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead className="w-1"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {vehicles.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-vw-grey">
                                    No vehicles found.
                                </TableCell>
                            </TableRow>
                        )}
                        {vehicles.data.map((vehicle) => (
                            <TableRow key={vehicle.id}>
                                <TableCell className="font-medium">
                                    {vehicle.plate_number}
                                </TableCell>
                                <TableCell>
                                    {vehicle.brand} {vehicle.model}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                    {vehicle.vin ?? '—'}
                                </TableCell>
                                <TableCell>{vehicle.year ?? '—'}</TableCell>
                                <TableCell>{vehicle.customer?.name ?? '—'}</TableCell>
                                <TableCell className="space-x-3 whitespace-nowrap text-right">
                                    <button
                                        type="button"
                                        onClick={() => openEditForm(vehicle)}
                                        className="text-sm font-medium text-vw-light-blue hover:underline"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeletingVehicle(vehicle)}
                                        className="text-sm font-medium text-urgent hover:underline"
                                    >
                                        Delete
                                    </button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {vehicles.links.length > 3 && (
                <div className="mt-4 flex flex-wrap gap-1">
                    {vehicles.links.map((link, i) => (
                        <Link
                            key={i}
                            href={link.url ?? '#'}
                            preserveScroll
                            preserveState
                            className={`rounded-md px-3 py-1.5 text-sm ${
                                link.active
                                    ? 'bg-vw-blue text-white'
                                    : link.url
                                    ? 'text-vw-grey hover:bg-vw-grey-light'
                                    : 'cursor-not-allowed text-vw-grey/40'
                            }`}
                            dangerouslySetInnerHTML={{ __html: link.label }}
                        />
                    ))}
                </div>
            )}

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