import { useState, useEffect } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, useForm, Link, usePage } from '@inertiajs/react';
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
import { Badge } from '@/Components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/Components/ui/dialog';

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
            },
        };

        // File upload butuh multipart — _method spoofing untuk edit (PUT), post biasa untuk tambah baru
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
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Staff Account</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete <strong>{user?.name}</strong>? This action
                        cannot be undone.
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

export default function Index({ users, search }) {
    const { auth } = usePage().props;
    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [formOpen, setFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deletingUser, setDeletingUser] = useState(null);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchTerm !== (search ?? '')) {
                router.get(
                    route('admin.users.index'),
                    { search: searchTerm || undefined },
                    { preserveState: true, replace: true }
                );
            }
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    const openAddForm = () => {
        setEditingUser(null);
        setFormOpen(true);
    };

    const openEditForm = (user) => {
        setEditingUser(user);
        setFormOpen(true);
    };

    return (
        <AdminLayout title="Staff Accounts">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or email..."
                    className="max-w-xs"
                />
                <Button onClick={openAddForm}>Add Staff Account</Button>
            </div>

            <div className="rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="w-1"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-vw-grey">
                                    No staff accounts found.
                                </TableCell>
                            </TableRow>
                        )}
                        {users.data.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>{user.phone ?? '—'}</TableCell>
                                <TableCell>
                                    <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                                        {ROLE_LABEL[user.role] ?? user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell className="space-x-3 whitespace-nowrap text-right">
                                    <button
                                        type="button"
                                        onClick={() => openEditForm(user)}
                                        className="text-sm font-medium text-vw-light-blue hover:underline"
                                    >
                                        Edit
                                    </button>
                                    {user.id !== auth.user.id && (
                                        <button
                                            type="button"
                                            onClick={() => setDeletingUser(user)}
                                            className="text-sm font-medium text-urgent hover:underline"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {users.links.length > 3 && (
                <div className="mt-4 flex flex-wrap gap-1">
                    {users.links.map((link, i) => (
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

            <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editingUser} />
            <DeleteConfirmDialog
                open={Boolean(deletingUser)}
                onOpenChange={(v) => !v && setDeletingUser(null)}
                user={deletingUser}
            />
        </AdminLayout>
    );
}