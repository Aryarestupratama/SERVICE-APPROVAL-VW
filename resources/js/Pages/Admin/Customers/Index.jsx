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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/Components/ui/dialog';

function CustomerFormDialog({ open, onOpenChange, customer, onSuccess }) {
    const isEdit = Boolean(customer);
    const { data, setData, post, put, processing, errors, reset } = useForm({
        name: customer?.name ?? '',
        phone: customer?.phone ?? '',
        email: customer?.email ?? '',
    });

    // Reset form data setiap kali dialog dibuka dengan customer berbeda (atau kosong = mode tambah)
    useEffect(() => {
        if (open) {
            setData({
                name: customer?.name ?? '',
                phone: customer?.phone ?? '',
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
            },
        };

        if (isEdit) {
            put(route('admin.customers.update', customer.id), options);
        } else {
            post(route('admin.customers.store'), options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{isEdit ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? 'Update customer details below.'
                                : 'Fill in the details for the new customer.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
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

                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                                id="phone"
                                value={data.phone}
                                onChange={(e) => setData('phone', e.target.value)}
                                placeholder="08xxxxxxxxxx"
                            />
                            {errors.phone && <p className="text-sm text-urgent">{errors.phone}</p>}
                        </div>

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
                            {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Customer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, customer }) {
    const { delete: destroy, processing } = useForm({});

    const handleDelete = () => {
        destroy(route('admin.customers.destroy', customer.id), {
            preserveScroll: true,
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Customer</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete <strong>{customer?.name}</strong>? This
                        will also affect related vehicles and service orders. This action cannot
                        be undone.
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

export default function Index({ customers, search }) {
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [formOpen, setFormOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [deletingCustomer, setDeletingCustomer] = useState(null);

    // Debounce search — kirim request setelah user berhenti ngetik 400ms
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchTerm !== (search ?? '')) {
                router.get(
                    route('admin.customers.index'),
                    { search: searchTerm || undefined },
                    { preserveState: true, replace: true }
                );
            }
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    const openAddForm = () => {
        setEditingCustomer(null);
        setFormOpen(true);
    };

    const openEditForm = (customer) => {
        setEditingCustomer(customer);
        setFormOpen(true);
    };

    return (
        <AdminLayout title="Customers">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="max-w-xs"
                />
                <Button onClick={openAddForm}>Add Customer</Button>
            </div>

            <div className="rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Vehicles</TableHead>
                            <TableHead className="w-1"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-vw-grey">
                                    No customers found.
                                </TableCell>
                            </TableRow>
                        )}
                        {customers.data.map((customer) => (
                            <TableRow key={customer.id}>
                                <TableCell className="font-medium">{customer.name}</TableCell>
                                <TableCell>{customer.phone}</TableCell>
                                <TableCell>{customer.email ?? '—'}</TableCell>
                                <TableCell>{customer.vehicles?.length ?? 0}</TableCell>
                                <TableCell className="space-x-3 whitespace-nowrap text-right">
                                    <button
                                        type="button"
                                        onClick={() => openEditForm(customer)}
                                        className="text-sm font-medium text-vw-light-blue hover:underline"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeletingCustomer(customer)}
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

            {customers.links.length > 3 && (
                <div className="mt-4 flex flex-wrap gap-1">
                    {customers.links.map((link, i) => (
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

            <CustomerFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                customer={editingCustomer}
            />

            <DeleteConfirmDialog
                open={Boolean(deletingCustomer)}
                onOpenChange={(v) => !v && setDeletingCustomer(null)}
                customer={deletingCustomer}
            />
        </AdminLayout>
    );
}