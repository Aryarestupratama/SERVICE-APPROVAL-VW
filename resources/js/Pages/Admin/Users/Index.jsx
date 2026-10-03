import { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, usePage, router, Head } from '@inertiajs/react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/Components/ui/sheet';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { PasswordInput } from '@/Components/ui/password-input';
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

    // isDesktopLive ikut berubah kapan saja layar di-resize (DevTools
    // dibuka/tutup, zoom, dsb). Kalau dipakai langsung, dialog yang lagi
    // kebuka bisa loncat dari Dialog ke Sheet (atau sebaliknya) di tengah
    // interaksi user, karena root Radix-nya beda total begitu cabang
    // if/else render berubah. Fix: snapshot nilainya HANYA saat dialog baru
    // dibuka (open: false -> true), lalu kunci selama dialog masih terbuka.
    const isDesktopLive = useMediaQuery('(min-width: 640px)');
    const [isDesktop, setIsDesktop] = useState(isDesktopLive);
    useEffect(() => {
        if (open) {
            setIsDesktop(isDesktopLive);
        }
    }, [open]);

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

    const { auth } = usePage().props;
    const isSelf = Boolean(isEdit && user?.id === auth.user.id);

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

    const formFields = (
        <div className="space-y-4 py-4">
            <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} />
                {errors.name && <p className="text-sm text-urgent">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
                {errors.email && <p className="text-sm text-urgent">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
                {errors.phone && <p className="text-sm text-urgent">{errors.phone}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Select value={data.role} onValueChange={(v) => setData('role', v)} disabled={isSelf}>
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
                {isSelf && <p className="text-xs text-gray-600">You cannot change your own role.</p>}
                {data.role === 'chief_technician' && (
                    <p className="text-xs text-vw-grey">
                        Chief technicians don't log in — this account is only used for
                        assignment plotting on service orders.
                    </p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="password">{isEdit ? 'New Password (optional)' : 'Password'}</Label>
                <PasswordInput
                    id="password"
                    value={data.password}
                    onChange={(e) => setData('password', e.target.value)}
                    placeholder={isEdit ? 'Leave blank to keep current password' : ''}
                />
                {errors.password && <p className="text-sm text-urgent">{errors.password}</p>}
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
    );

    const formActions = (
        <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing} className="flex-1 sm:flex-none">
                Cancel
            </Button>
            <Button type="submit" disabled={processing} className="flex-1 sm:flex-none">
                {processing ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
            </Button>
        </>
    );

    const title = isEdit ? 'Edit Staff Account' : 'Add Staff Account';
    const description = isEdit
        ? 'Update this staff account. Leave password blank to keep it unchanged.'
        : 'Create a login account for admin or service advisor staff.';

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

function DeleteConfirmDialog({ open, onOpenChange, user }) {
    // Sama seperti UserFormDialog — kunci isDesktop saat dialog dibuka
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
        destroy(route('admin.users.destroy', user.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (page.props.flash?.error) {
                    toast.error('Failed to delete staff account', { description: page.props.flash.error });
                    onOpenChange(false);
                    return;
                }
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

    const title = 'Delete Staff Account';
    const description = (
        <>
            Are you sure you want to delete <strong>{user?.name}</strong>? This action cannot be undone.
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

// Filter panel Users — role: select dari 3 role yang ada. name/email/phone
// sudah cukup dicover global search server-side, tidak perlu filter terpisah.
const filterDefs = [
    {
        key: 'role',
        label: 'Role',
        type: 'select',
        options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
    },
];

export default function Index({ users, search, filters }) {
    const { auth } = usePage().props;
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [sorting, setSorting] = useState(() =>
        filters?.sort_by ? [{ id: filters.sort_by, desc: filters.sort_dir === 'desc' }] : []
    );
    const [activeFilters, setActiveFilters] = useState(() => ({
        role: filters?.role ?? '',
    }));
    const [formOpen, setFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deletingUser, setDeletingUser] = useState(null);
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
                role: activeFilters.role || undefined,
                sort_by: sorting[0]?.id || undefined,
                sort_dir: sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined,
            };

            router.get(route('admin.users.index'), nextParams, {
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
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                            type="button"
                            onClick={() => openEditForm(row.original)}
                            className="inline-flex min-h-[36px] items-center px-2 text-sm font-medium text-vw-light-blue hover:underline"
                        >
                            Edit
                        </button>
                        {row.original.id !== auth.user.id && (
                            <button
                                type="button"
                                onClick={() => setDeletingUser(row.original)}
                                className="inline-flex min-h-[36px] items-center px-2 text-sm font-medium text-urgent hover:underline"
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

    const table = useDataTable({
        data: users.data,
        columns,
        manualSorting: true,
        sorting,
        onSortingChange: setSorting,
    });

    return (
        <AdminLayout title="Staff Accounts">
            <Head title="Staff Accounts" />
            <DataTable
                table={table}
                links={users.links}
                emptyMessage="No staff accounts found."
                isLoading={isLoading}
                isFiltered={Boolean(searchTerm || activeFilters.role)}
                paginationMeta={{ from: users.from, to: users.to, total: users.total }}
                onRowClick={openEditForm}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or email..."
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
                primaryAction={<Button onClick={openAddForm}>Add Staff Account</Button>}
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