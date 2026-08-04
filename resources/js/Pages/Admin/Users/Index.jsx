import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, usePage, router } from '@inertiajs/react';
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
import { Badge } from '@/Components/ui/badge';
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

const ROLE_LABEL = {
    admin: 'Admin',
    service_advisor: 'Service Advisor',
    chief_technician: 'Chief Technician',
};

const ROLE_BADGE_VARIANT = {
    admin: 'default',
    service_advisor: 'secondary',
    chief_technician: 'outline',
};

function UserFormDialog({ open, onOpenChange, user, onSuccess }) {
    const isEdit = Boolean(user);
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
        role: user?.role ?? 'service_advisor',
        password: '',
        photo: null,
        _method: isEdit ? 'put' : 'post',
    });

    const [photoPreview, setPhotoPreview] = useState(user?.photo_path ?? null);

    useEffect(() => {
        if (open) {
            clearErrors();
            setData({
                name: user?.name ?? '',
                email: user?.email ?? '',
                phone: user?.phone ?? '',
                role: user?.role ?? 'service_advisor',
                password: '',
                photo: null,
                _method: isEdit ? 'put' : 'post',
            });
            setPhotoPreview(user?.photo_path ?? null);
        }
    }, [open, user]);

    const handlePhotoChange = (e) => {
        const file = e.target.files?.[0] ?? null;
        setData('photo', file);
        if (file) setPhotoPreview(URL.createObjectURL(file));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const options = {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                reset();
                onOpenChange(false);
                onSuccess?.();
                toast.success(
                    isEdit ? 'Staff account updated' : 'Staff account created',
                    {
                        description: isEdit
                            ? `${data.name} has been updated.`
                            : `${data.name} has been added as ${data.role.replace('_', ' ')}.`,
                    }
                );
            },
            onError: () => {
                toast.error('Failed to save staff account', {
                    description: 'Please check the form for errors and try again.',
                });
            },
        };

        if (isEdit) {
            post(route('admin.users.update', user.id), options);
        } else {
            post(route('admin.users.store'), options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{isEdit ? 'Edit Staff Account' : 'Add Staff Account'}</DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? 'Update this staff account. Leave password blank to keep it unchanged.'
                                : 'Create a login account for admin or service advisor staff.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                            />
                            {errors.name && <p className="text-sm text-urgent">{errors.name}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                            />
                            {errors.email && <p className="text-sm text-urgent">{errors.email}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone (optional)</Label>
                            <Input
                                id="phone"
                                value={data.phone}
                                onChange={(e) => setData('phone', e.target.value)}
                            />
                            {errors.phone && <p className="text-sm text-urgent">{errors.phone}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="role">Role</Label>
                            <Select value={data.role} onValueChange={(v) => setData('role', v)}>
                                <SelectTrigger id="role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="service_advisor">Service Advisor</SelectItem>
                                    <SelectItem value="chief_technician">Chief Technician</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.role && <p className="text-sm text-urgent">{errors.role}</p>}
                            {data.role === 'chief_technician' && (
                                <p className="text-xs text-vw-grey">
                                    Chief technicians don't log in — this account is only used for
                                    assignment plotting on service orders.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">
                                {isEdit ? 'New Password (optional)' : 'Password'}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                placeholder={isEdit ? 'Leave blank to keep current password' : ''}
                            />
                            {errors.password && (
                                <p className="text-sm text-urgent">{errors.password}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="photo">Photo (optional)</Label>
                            {photoPreview && (
                                <img
                                    src={photoPreview.startsWith('blob:') ? photoPreview : `/storage/${photoPreview}`}
                                    alt="Photo preview"
                                    className="mb-2 h-16 w-16 rounded-full border border-vw-grey/20 object-cover"
                                />
                            )}
                            <Input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} />
                            {errors.photo && <p className="text-sm text-urgent">{errors.photo}</p>}
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
                            {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, user }) {
    const { delete: destroy, processing } = useForm({});

    const handleDelete = () => {
        destroy(route('admin.users.destroy', user.id), {
            preserveScroll: true,
            onSuccess: () => {
                onOpenChange(false);
                toast.success('Staff account deleted', {
                    description: `${user?.name} has been removed.`,
                });
            },
            onError: () => {
                toast.error('Failed to delete staff account', {
                    description: 'This account may still be linked to active service orders.',
                });
            },
        });
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Staff Account</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete <strong>{user?.name}</strong>? This action
                        cannot be undone.
                    </AlertDialogDescription>
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

// Filter panel Users — role: select dari 3 role yang ada. name/email/phone
// sudah cukup dicover global search server-side, tidak perlu filter terpisah.
const filterDefs = [
    {
        key: 'role',
        label: 'Role',
        type: 'select',
        options: Object.keys(ROLE_LABEL),
    },
];

export default function Index({ users, search, filters }) {
    const { auth } = usePage().props;
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        role: filters?.role ?? '',
    }));
    const [formOpen, setFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deletingUser, setDeletingUser] = useState(null);

    // Search dan filter digabung jadi satu request/debounce — sama pola
    // dengan Admin/Vehicles/Index.jsx (PROJECT-RULES bagian 10.5).
    useEffect(() => {
        const timeout = setTimeout(() => {
            const nextParams = {
                search: searchTerm || undefined,
                role: activeFilters.role || undefined,
            };

            router.get(route('admin.users.index'), nextParams, {
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
        setActiveFilters({ role: '' });
    };

    const openAddForm = () => {
        setEditingUser(null);
        setFormOpen(true);
    };

    const openEditForm = (user) => {
        setEditingUser(user);
        setFormOpen(true);
    };

    const columns = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                meta: { label: 'Name' },
                cell: ({ row }) => (
                    <span className="font-medium">{row.original.name}</span>
                ),
            },
            {
                accessorKey: 'email',
                header: 'Email',
                meta: { label: 'Email' },
            },
            {
                accessorKey: 'phone',
                header: 'Phone',
                meta: { label: 'Phone' },
                cell: ({ row }) => row.original.phone ?? '—',
            },
            {
                accessorKey: 'role',
                header: 'Role',
                meta: { label: 'Role' },
                cell: ({ row }) => (
                    <Badge variant={ROLE_BADGE_VARIANT[row.original.role]}>
                        {ROLE_LABEL[row.original.role] ?? row.original.role}
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
                        <button
                            type="button"
                            onClick={() => openEditForm(row.original)}
                            className="text-sm font-medium text-vw-light-blue hover:underline"
                        >
                            Edit
                        </button>
                        {row.original.id !== auth.user.id && (
                            <button
                                type="button"
                                onClick={() => setDeletingUser(row.original)}
                                className="text-sm font-medium text-urgent hover:underline"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                ),
            },
        ],
        [auth.user.id]
    );

    const table = useDataTable({ data: users.data, columns });

    return (
        <AdminLayout
            title="Staff Accounts"
            headerActions={<Button onClick={openAddForm}>Add Staff Account</Button>}
        >
            <DataTable
                table={table}
                links={users.links}
                emptyMessage="No staff accounts found."
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or email..."
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

            <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editingUser} />
            <DeleteConfirmDialog
                open={Boolean(deletingUser)}
                onOpenChange={(v) => !v && setDeletingUser(null)}
                user={deletingUser}
            />
        </AdminLayout>
    );
}