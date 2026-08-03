import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, router, usePage } from '@inertiajs/react';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';

const ALLOWED_TRANSITIONS = {
    appointment: ['work_in_progress'],
    work_in_progress: ['quality_control', 'all_rejected_cancelled'],
    quality_control: ['invoice_preparation'],
    invoice_preparation: ['completed'],
};

// Status yang bisa dimundurkan admin kembali ke work_in_progress
// (PROJECT-RULES bagian 7 poin 8).
const REVERT_TRANSITIONS = {
    quality_control: 'work_in_progress',
    invoice_preparation: 'work_in_progress',
    completed: 'work_in_progress',
};

const STATUS_VARIANT = {
    appointment: 'secondary',
    work_in_progress: 'default',
    quality_control: 'default',
    invoice_preparation: 'default',
    completed: 'success',
    all_rejected_cancelled: 'destructive',
};

const STATUS_LABEL = {
    appointment: 'Appointment',
    work_in_progress: 'Work In Progress',
    quality_control: 'Quality Control',
    invoice_preparation: 'Invoice Preparation',
    completed: 'Completed',
    all_rejected_cancelled: 'Rejected & Cancelled',
};

const ITEM_STATUS_VARIANT = {
    pending: 'secondary',
    approved: 'success',
    rejected: 'destructive',
};

const ITEM_STATUS_LABEL = {
    pending: 'Waiting Approval',
};

// Urutan tetap sesuai InspectionItem::GROUPS / ServiceOrderEstimationDocument::GROUPS
const GROUPS = ['related', 'safety', 'durability', 'experience', 'appearance'];

const GROUP_LABEL = {
    related: 'Related',
    safety: 'Safety',
    durability: 'Durability',
    experience: 'Experience',
    appearance: 'Appearance',
};

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
}

// Decided at cuma tanggal, tanpa jam (permintaan owner).
function formatDate(value) {
    return new Date(value).toLocaleDateString('id-ID');
}

function itemDisplayTotal(item) {
    if (item.final_price_snapshot !== null && item.final_price_snapshot !== undefined) {
        return Number(item.final_price_snapshot);
    }

    const itemAfterDiscount =
        Number(item.cost_item) * (1 - Number(item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount =
        Number(item.cost_labour) * (1 - Number(item.discount_labour_percent ?? 0) / 100);

    return itemAfterDiscount + labourAfterDiscount;
}

function itemSubtotal(item) {
    const itemAfterDiscount =
        Number(item.cost_item) * (1 - Number(item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount =
        Number(item.cost_labour) * (1 - Number(item.discount_labour_percent ?? 0) / 100);

    return itemAfterDiscount + labourAfterDiscount;
}

function sortedInvoices(invoices) {
    return [...(invoices ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

// Map estimationDocuments (array, bisa cuma sebagian group yang ada baris-nya)
// jadi lookup by group.
function estimationDocsByGroup(docs) {
    const map = {};
    (docs ?? []).forEach((doc) => {
        map[doc.group] = doc;
    });
    return map;
}

const EMPTY_ITEM_FORM = {
    name: '',
    description: '',
    cost_item: '',
    cost_labour: '',
    discount_item_percent: '',
    discount_labour_percent: '',
    group: '',
};

export default function Show({ order, settings, maxInvoices, breakdownByGroup }) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    const [pendingStatus, setPendingStatus] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);

    // Group mana yang lagi dipilih file-nya di form upload estimation form.
    const [selectedGroup, setSelectedGroup] = useState(null);

    // State untuk add/edit item — addingToGroup menandai card group mana yang
    // lagi buka form "tambah item"; editingItemId menandai item mana yang
    // lagi dalam mode edit.
    const [addingToGroup, setAddingToGroup] = useState(null);
    const [editingItemId, setEditingItemId] = useState(null);

    const { setData, patch, processing } = useForm({ status: '' });
    const invoiceForm = useForm({ invoice_pdfs: [] });
    const estimationForm = useForm({ group: '', pdf: null });
    const addItemForm = useForm({ ...EMPTY_ITEM_FORM });
    const editItemForm = useForm({ ...EMPTY_ITEM_FORM });

    const availableTransitions = ALLOWED_TRANSITIONS[order.status] ?? [];
    const revertTarget = REVERT_TRANSITIONS[order.status] ?? null;

    const invoices = sortedInvoices(order.invoices);
    const hasInvoice = invoices.length > 0;
    const remainingSlots = (maxInvoices ?? 5) - invoices.length;

    // Invoice PDF section disembunyikan selama work_in_progress (dan appointment/
    // quality_control), baru muncul mulai invoice_preparation — permintaan owner.
    const showInvoiceSection = ['invoice_preparation', 'completed'].includes(order.status);

    const docsByGroup = estimationDocsByGroup(order.estimation_documents);
    const vatPercent = Number(settings?.ppn_percent ?? 0);
    const canEditEstimationDocs = order.status === 'work_in_progress';
    const canEditItems = order.status === 'work_in_progress';

    const handleSelectStatus = (value) => {
        setPendingStatus(value);
        setData('status', value);
        setConfirmOpen(true);
    };

    const confirmStatusChange = () => {
        patch(route('admin.service-orders.update-status', order.id), {
            preserveScroll: true,
            onFinish: () => {
                setConfirmOpen(false);
                setPendingStatus(null);
            },
        });
    };

    const confirmRevertStatus = () => {
        router.patch(
            route('admin.service-orders.revert-status', order.id),
            {},
            {
                preserveScroll: true,
                onFinish: () => setRevertConfirmOpen(false),
            }
        );
    };

    const handleInvoiceFilesChange = (e) => {
        invoiceForm.setData('invoice_pdfs', Array.from(e.target.files));
    };

    const handleInvoiceUpload = (e) => {
        e.preventDefault();
        invoiceForm.post(route('admin.service-orders.upload-invoice', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => invoiceForm.reset(),
        });
    };

    const handleDeleteInvoice = (invoiceId) => {
        if (!confirm('Hapus invoice PDF ini?')) return;

        router.delete(
            route('admin.service-orders.delete-invoice', [order.id, invoiceId]),
            { preserveScroll: true }
        );
    };

    const handleEstimationFileChange = (group, file) => {
        setSelectedGroup(group);
        estimationForm.setData({ group, pdf: file });
    };

    const handleEstimationUpload = (e) => {
        e.preventDefault();
        estimationForm.post(route('admin.service-orders.upload-estimation-document', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                estimationForm.reset();
                setSelectedGroup(null);
            },
        });
    };

    const handleDeleteEstimationDoc = (doc) => {
        if (!confirm(`Hapus estimation form untuk kelompok ${GROUP_LABEL[doc.group]}?`)) return;

        router.delete(
            route('admin.service-orders.delete-estimation-document', [order.id, doc.id]),
            { preserveScroll: true }
        );
    };

    // --- Item CRUD handlers ---

    const openAddItemForm = (group) => {
        setAddingToGroup(group);
        setEditingItemId(null);
        addItemForm.reset();
        addItemForm.setData({ ...EMPTY_ITEM_FORM, group });
    };

    const closeAddItemForm = () => {
        setAddingToGroup(null);
        addItemForm.reset();
    };

    const handleAddItemSubmit = (e) => {
        e.preventDefault();
        addItemForm.post(route('admin.service-orders.inspection-items.store', order.id), {
            preserveScroll: true,
            onSuccess: () => closeAddItemForm(),
        });
    };

    const openEditItemForm = (item) => {
        setEditingItemId(item.id);
        setAddingToGroup(null);
        editItemForm.reset();
        editItemForm.setData({
            name: item.name,
            description: item.description ?? '',
            cost_item: item.cost_item,
            cost_labour: item.cost_labour,
            discount_item_percent: item.discount_item_percent,
            discount_labour_percent: item.discount_labour_percent,
            group: item.group,
        });
    };

    const closeEditItemForm = () => {
        setEditingItemId(null);
        editItemForm.reset();
    };

    const handleEditItemSubmit = (e, itemId) => {
        e.preventDefault();
        editItemForm.patch(
            route('admin.service-orders.inspection-items.update', [order.id, itemId]),
            {
                preserveScroll: true,
                onSuccess: () => closeEditItemForm(),
            }
        );
    };

    const handleDeleteItem = (item) => {
        if (!confirm(`Hapus item "${item.name}"?`)) return;

        router.delete(
            route('admin.service-orders.inspection-items.destroy', [order.id, item.id]),
            { preserveScroll: true }
        );
    };

    const handleReopenItem = (item) => {
        if (!confirm(`Buka ulang item "${item.name}" untuk dinegosiasikan lagi?`)) return;

        router.post(
            route('admin.service-orders.inspection-items.reopen', [order.id, item.id]),
            {},
            { preserveScroll: true }
        );
    };

    // Group yang belum punya item sama sekali — dipakai untuk selector
    // "Add Item to New Group", karena card group cuma dirender kalau
    // group itu sudah punya item ATAU sedang dalam proses ditambahkan.
    const groupsWithItems = new Set(
        (order.inspection_items ?? []).map((item) => item.group)
    );
    const missingGroups = GROUPS.filter((group) => !groupsWithItems.has(group));

    // --- Totals ---

    const subtotal =
        order.inspection_items?.reduce((sum, item) => sum + itemSubtotal(item), 0) ?? 0;
    const vatAmount = subtotal * (vatPercent / 100);
    const grandTotal = subtotal + vatAmount;

    // Grand total khusus item yang sudah approved (final_price_snapshot sudah
    // termasuk VAT saat dikunci) — permintaan owner.
    const grandTotalApproved =
        order.inspection_items
            ?.filter((item) => item.status === 'approved')
            .reduce((sum, item) => sum + Number(item.final_price_snapshot ?? 0), 0) ?? 0;

    const isCompletedBlocked = !hasInvoice && availableTransitions.includes('completed');

    return (
        <AdminLayout title={`Service Order #${order.work_order_number ?? order.id}`}>
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Kolom kiri: info utama */}
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Order Overview</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                                    {STATUS_LABEL[order.status] ?? order.status}
                                </Badge>
                                {order.items_approval_status && (
                                    <Badge variant="outline">
                                        Items: {order.items_approval_status.replace('_', ' ')}
                                    </Badge>
                                )}
                                {order.status === 'invoice_preparation' && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                                        Waiting for Pickup
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-vw-grey">Customer</p>
                                <p className="font-medium text-gray-900">
                                    {order.vehicle?.customer?.name ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Phone</p>
                                <p className="font-medium text-gray-900">
                                    {order.vehicle?.customer?.phone ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Vehicle</p>
                                <p className="font-medium text-gray-900">
                                    {order.vehicle
                                        ? `${order.vehicle.brand} ${order.vehicle.model} (${order.vehicle.year ?? '-'})`
                                        : '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Plate Number</p>
                                <p className="font-medium text-gray-900">
                                    {order.vehicle?.plate_number ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">VIN/Chasis Number</p>
                                <p className="font-medium text-gray-900">
                                    {order.vehicle?.vin ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Service Advisor</p>
                                <p className="font-medium text-gray-900">
                                    {order.service_advisor?.name ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Chief Technician</p>
                                <p className="font-medium text-gray-900">
                                    {order.technician?.name ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Work Order Number</p>
                                <p className="font-medium text-gray-900">
                                    {order.work_order_number ?? '—'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {canEditItems && missingGroups.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Add Item to a New Group</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                                <Label>Group</Label>
                                <Select
                                    value={addingToGroup && missingGroups.includes(addingToGroup) ? addingToGroup : ''}
                                    onValueChange={(value) => openAddItemForm(value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a group without items yet" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {missingGroups.map((group) => (
                                            <SelectItem key={group} value={group}>
                                                {GROUP_LABEL[group]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                )}

                    {/*
                        Inspection Items — direstrukturisasi (permintaan owner):
                        1 card per group, urut tetap sesuai GROUPS, HANYA muncul kalau
                        group itu punya minimal 1 item. Di dalam tiap card, urutannya:
                        header (judul group, bukan badge) -> daftar item -> cost
                        breakdown khusus group itu -> estimation form khusus group itu.
                        Semua kondisional terhadap "group ada item di dalamnya".
                    */}
                    {GROUPS.map((group) => {
                        const groupItems = (order.inspection_items ?? []).filter(
                            (item) => item.group === group
                        );

                        // Tetap disembunyikan kalau kosong, KECUALI sedang dalam proses
                        // menambahkan item pertama ke group ini (dipicu dari selector di atas).
                        if (groupItems.length === 0 && addingToGroup !== group) return null;

                        const breakdown = breakdownByGroup?.[group] ?? { subtotal: 0, vat_amount: 0, grand_total: 0 };
                        const doc = docsByGroup[group];
                        const hasFile = doc?.pdf_path;

                        return (
                            <Card key={group}>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>{GROUP_LABEL[group]}</CardTitle>
                                    {canEditItems && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openAddItemForm(group)}
                                        >
                                            <Plus className="mr-1 h-4 w-4" /> Add Item
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Form tambah item — hanya muncul kalau lagi buka form untuk group ini */}
                                    {addingToGroup === group && (
                                        <form
                                            onSubmit={handleAddItemSubmit}
                                            className="space-y-3 rounded-md border border-vw-blue/30 bg-vw-blue/5 p-4"
                                        >
                                            <div className="space-y-1.5">
                                                <Label>Item Name</Label>
                                                <Input
                                                    value={addItemForm.data.name}
                                                    onChange={(e) =>
                                                        addItemForm.setData('name', e.target.value)
                                                    }
                                                />
                                                {addItemForm.errors.name && (
                                                    <p className="text-sm text-urgent">
                                                        {addItemForm.errors.name}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Description (optional)</Label>
                                                <Textarea
                                                    value={addItemForm.data.description}
                                                    onChange={(e) =>
                                                        addItemForm.setData('description', e.target.value)
                                                    }
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div className="space-y-1.5">
                                                    <Label>Labour Price (IDR)</Label>
                                                    <Input
                                                        type="number"
                                                        value={addItemForm.data.cost_labour}
                                                        onChange={(e) =>
                                                            addItemForm.setData('cost_labour', e.target.value)
                                                        }
                                                    />
                                                    {addItemForm.errors.cost_labour && (
                                                        <p className="text-sm text-urgent">
                                                            {addItemForm.errors.cost_labour}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Part Price (IDR)</Label>
                                                    <Input
                                                        type="number"
                                                        value={addItemForm.data.cost_item}
                                                        onChange={(e) =>
                                                            addItemForm.setData('cost_item', e.target.value)
                                                        }
                                                    />
                                                    {addItemForm.errors.cost_item && (
                                                        <p className="text-sm text-urgent">
                                                            {addItemForm.errors.cost_item}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div className="space-y-1.5">
                                                    <Label>Labour Discount (%)</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={addItemForm.data.discount_labour_percent}
                                                        onChange={(e) =>
                                                            addItemForm.setData(
                                                                'discount_labour_percent',
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Part Discount (%)</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={addItemForm.data.discount_item_percent}
                                                        onChange={(e) =>
                                                            addItemForm.setData(
                                                                'discount_item_percent',
                                                                e.target.value
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={closeAddItemForm}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button type="submit" size="sm" disabled={addItemForm.processing}>
                                                    {addItemForm.processing ? 'Saving...' : 'Save Item'}
                                                </Button>
                                            </div>
                                        </form>
                                    )}

                                    {/* Daftar item di dalam group ini */}
                                    <div className="divide-y divide-vw-grey/10">
                                        {groupItems.map((item) => (
                                            <div key={item.id} className="space-y-2 py-3">
                                                {editingItemId === item.id ? (
                                                    <form
                                                        onSubmit={(e) => handleEditItemSubmit(e, item.id)}
                                                        className="space-y-3 rounded-md border border-vw-blue/30 bg-vw-blue/5 p-4"
                                                    >
                                                        <div className="space-y-1.5">
                                                            <Label>Item Name</Label>
                                                            <Input
                                                                value={editItemForm.data.name}
                                                                onChange={(e) =>
                                                                    editItemForm.setData('name', e.target.value)
                                                                }
                                                            />
                                                            {editItemForm.errors.name && (
                                                                <p className="text-sm text-urgent">
                                                                    {editItemForm.errors.name}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label>Description (optional)</Label>
                                                            <Textarea
                                                                value={editItemForm.data.description}
                                                                onChange={(e) =>
                                                                    editItemForm.setData(
                                                                        'description',
                                                                        e.target.value
                                                                    )
                                                                }
                                                                rows={2}
                                                            />
                                                        </div>
                                                        <div className="grid gap-3 sm:grid-cols-2">
                                                            <div className="space-y-1.5">
                                                                <Label>Labour Price (IDR)</Label>
                                                                <Input
                                                                    type="number"
                                                                    value={editItemForm.data.cost_labour}
                                                                    onChange={(e) =>
                                                                        editItemForm.setData(
                                                                            'cost_labour',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label>Part Price (IDR)</Label>
                                                                <Input
                                                                    type="number"
                                                                    value={editItemForm.data.cost_item}
                                                                    onChange={(e) =>
                                                                        editItemForm.setData(
                                                                            'cost_item',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="grid gap-3 sm:grid-cols-2">
                                                            <div className="space-y-1.5">
                                                                <Label>Labour Discount (%)</Label>
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    value={
                                                                        editItemForm.data.discount_labour_percent
                                                                    }
                                                                    onChange={(e) =>
                                                                        editItemForm.setData(
                                                                            'discount_labour_percent',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label>Part Discount (%)</Label>
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    value={editItemForm.data.discount_item_percent}
                                                                    onChange={(e) =>
                                                                        editItemForm.setData(
                                                                            'discount_item_percent',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={closeEditItemForm}
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                type="submit"
                                                                size="sm"
                                                                disabled={editItemForm.processing}
                                                            >
                                                                {editItemForm.processing
                                                                    ? 'Saving...'
                                                                    : 'Save Changes'}
                                                            </Button>
                                                        </div>
                                                    </form>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="font-medium text-gray-900">
                                                                    {item.name}
                                                                </div>
                                                                {item.description && (
                                                                    <p className="text-sm text-vw-grey">
                                                                        {item.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-medium text-gray-900">
                                                                    {formatCurrency(itemDisplayTotal(item))}
                                                                </p>
                                                                <Badge
                                                                    variant={
                                                                        ITEM_STATUS_VARIANT[item.status] ??
                                                                        'secondary'
                                                                    }
                                                                >
                                                                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-xs text-vw-grey sm:grid-cols-4">
                                                            <div>
                                                                <span className="block">Part price</span>
                                                                <span className="text-gray-900">
                                                                    {formatCurrency(item.cost_item)}
                                                                </span>
                                                                {Number(item.discount_item_percent) > 0 && (
                                                                    <span className="ml-1">
                                                                        (-{item.discount_item_percent}%)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="block">Labour price</span>
                                                                <span className="text-gray-900">
                                                                    {formatCurrency(item.cost_labour)}
                                                                </span>
                                                                {Number(item.discount_labour_percent) > 0 && (
                                                                    <span className="ml-1">
                                                                        (-{item.discount_labour_percent}%)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="block">Final price</span>
                                                                <span className="text-gray-900">
                                                                    {item.final_price_snapshot !== null
                                                                        ? formatCurrency(item.final_price_snapshot)
                                                                        : 'Not locked yet'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="block">Decided at</span>
                                                                <span className="text-gray-900">
                                                                    {item.decided_at
                                                                        ? formatDate(item.decided_at)
                                                                        : '—'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Aksi item — hanya muncul selama work_in_progress.
                                                            Edit/Delete cuma untuk item yang belum locked
                                                            (pending/rejected). Reopen cuma untuk rejected. */}
                                                        {canEditItems && (
                                                            <div className="flex items-center gap-3 pt-1">
                                                                {item.status !== 'approved' && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openEditItemForm(item)}
                                                                            className="flex items-center gap-1 text-xs font-medium text-vw-light-blue hover:underline"
                                                                        >
                                                                            <Pencil className="h-3 w-3" /> Edit
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteItem(item)}
                                                                            className="flex items-center gap-1 text-xs font-medium text-urgent hover:underline"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" /> Delete
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {item.status === 'rejected' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleReopenItem(item)}
                                                                        className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline"
                                                                    >
                                                                        <RotateCcw className="h-3 w-3" /> Reopen
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Cost breakdown khusus group ini */}
                                    {groupItems.length > 0 && (
                                        <div className="space-y-1 border-t border-vw-grey/10 pt-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <p className="text-vw-grey">Subtotal</p>
                                                <p className="text-gray-900">{formatCurrency(breakdown.subtotal)}</p>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <p className="text-vw-grey">VAT ({vatPercent}%)</p>
                                                <p className="text-gray-900">{formatCurrency(breakdown.vat_amount)}</p>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-vw-grey/10 pt-1.5">
                                                <p className="font-semibold text-gray-900">Group Total</p>
                                                <p className="font-semibold text-gray-900">
                                                    {formatCurrency(breakdown.grand_total)}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Estimation form khusus group ini */}
                                    {groupItems.length > 0 && (
                                        <div className="rounded-lg border border-vw-grey/10 p-3">
                                            <p className="mb-2 text-sm font-medium text-gray-900">
                                                Estimation Form
                                            </p>

                                            {!canEditEstimationDocs && (
                                                <p className="text-xs text-vw-grey">
                                                    Estimation forms can only be uploaded or changed while
                                                    the order is at Work In Progress.
                                                </p>
                                            )}

                                            {hasFile ? (
                                                <div className="space-y-0.5">
                                                    <a
                                                        href={`/storage/${doc.pdf_path}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-blue-600 underline"
                                                    >
                                                        View current file
                                                    </a>
                                                    {doc.uploaded_at && (
                                                        <p className="text-xs text-vw-grey">
                                                            Uploaded {formatDate(doc.uploaded_at)}
                                                            {doc.uploaded_by?.name && ` by ${doc.uploaded_by.name}`}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                canEditEstimationDocs && (
                                                    <p className="text-sm text-vw-grey">No file uploaded yet.</p>
                                                )
                                            )}

                                            {canEditEstimationDocs && (
                                                <form
                                                    onSubmit={handleEstimationUpload}
                                                    className="mt-2 flex items-center gap-2"
                                                >
                                                    <Input
                                                        type="file"
                                                        accept="application/pdf"
                                                        className="text-xs"
                                                        onChange={(e) =>
                                                            handleEstimationFileChange(group, e.target.files[0])
                                                        }
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        disabled={
                                                            estimationForm.processing ||
                                                            selectedGroup !== group ||
                                                            !estimationForm.data.pdf
                                                        }
                                                    >
                                                        {estimationForm.processing && selectedGroup === group
                                                            ? 'Uploading...'
                                                            : hasFile
                                                            ? 'Replace'
                                                            : 'Upload'}
                                                    </Button>
                                                    {hasFile && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-red-600 hover:text-red-700"
                                                            onClick={() => handleDeleteEstimationDoc(doc)}
                                                        >
                                                            Delete
                                                        </Button>
                                                    )}
                                                </form>
                                            )}
                                            {selectedGroup === group && estimationForm.errors.pdf && (
                                                <p className="mt-1 text-xs text-red-600">
                                                    {estimationForm.errors.pdf}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    {(order.inspection_items?.length ?? 0) === 0 && (
                        <Card>
                            <CardContent className="py-8 text-center text-sm text-vw-grey">
                                No inspection items yet.
                            </CardContent>
                        </Card>
                    )}

                    {/* Grand total gabungan seluruh group + grand total khusus approved */}
                    {(order.inspection_items?.length ?? 0) > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Order Totals</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <p className="text-vw-grey">Subtotal</p>
                                    <p className="text-gray-900">{formatCurrency(subtotal)}</p>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <p className="text-vw-grey">VAT ({vatPercent}%)</p>
                                    <p className="text-gray-900">{formatCurrency(vatAmount)}</p>
                                </div>
                                <div className="flex items-center justify-between border-t border-vw-grey/10 pt-1.5">
                                    <p className="font-semibold text-gray-900">Grand Total</p>
                                    <p className="font-semibold text-gray-900">{formatCurrency(grandTotal)}</p>
                                </div>
                                <div className="flex items-center justify-between pt-1 text-sm">
                                    <p className="font-medium text-vw-grey">Grand Total Approved</p>
                                    <p className="font-medium text-gray-900">
                                        {formatCurrency(grandTotalApproved)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Kolom kanan: status control + invoice */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Update Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {availableTransitions.length > 0 ? (
                                <>
                                    <Select
                                        value=""
                                        onValueChange={handleSelectStatus}
                                        disabled={processing}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Move to next status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableTransitions.map((status) => (
                                                <SelectItem
                                                    key={status}
                                                    value={status}
                                                    disabled={status === 'completed' && !hasInvoice}
                                                >
                                                    {STATUS_LABEL[status]}
                                                    {status === 'completed' &&
                                                        !hasInvoice &&
                                                        ' (upload invoice first)'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {isCompletedBlocked && (
                                        <p className="text-xs text-red-600">
                                            Upload minimal 1 invoice PDF dulu sebelum bisa menandai
                                            order completed.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-vw-grey">
                                    This order is at a final status ({STATUS_LABEL[order.status]}
                                    ) — no further manual transition available.
                                </p>
                            )}

                            {/* Revert status — khusus admin, dipakai kalau ada miss
                                komunikasi soal item setelah lewat negosiasi
                                (PROJECT-RULES bagian 7 poin 8). */}
                            {isAdmin && revertTarget && (
                                <div className="border-t border-vw-grey/10 pt-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setRevertConfirmOpen(true)}
                                    >
                                        <RotateCcw className="mr-1 h-4 w-4" />
                                        Revert to {STATUS_LABEL[revertTarget]}
                                    </Button>
                                    <p className="mt-1 text-xs text-vw-grey">
                                        Admin only — use this if items need to be reopened for
                                        negotiation after this stage.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Invoice PDF section — disembunyikan selama work_in_progress
                        (dan sebelumnya), baru muncul mulai invoice_preparation. */}
                    {showInvoiceSection && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Invoice PDF{invoices.length > 1 ? 's' : ''}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {hasInvoice ? (
                                    <ul className="space-y-2">
                                        {invoices.map((invoice, index) => (
                                            <li
                                                key={invoice.id}
                                                className="flex items-center justify-between gap-2 rounded border border-vw-grey/10 p-2"
                                            >
                                                <div className="space-y-0.5">
                                                    <a
                                                        href={`/storage/${invoice.file_path}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-blue-600 underline"
                                                    >
                                                        {invoice.label ?? `Invoice ${index + 1}`}
                                                    </a>
                                                    {invoice.uploaded_at && (
                                                        <p className="text-xs text-vw-grey">
                                                            Uploaded {formatDate(invoice.uploaded_at)}
                                                            {invoice.uploaded_by?.name &&
                                                                ` by ${invoice.uploaded_by.name}`}
                                                        </p>
                                                    )}
                                                </div>
                                                {order.status !== 'completed' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-600 hover:text-red-700"
                                                        onClick={() => handleDeleteInvoice(invoice.id)}
                                                    >
                                                        Delete
                                                    </Button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-vw-grey">No invoice uploaded yet.</p>
                                )}

                                {order.status !== 'completed' && (
                                    <form onSubmit={handleInvoiceUpload} className="space-y-2">
                                        <Label htmlFor="invoice_pdfs">
                                            Upload invoice PDF(s) — {remainingSlots} slot
                                            {remainingSlots === 1 ? '' : 's'} remaining
                                        </Label>
                                        <Input
                                            id="invoice_pdfs"
                                            type="file"
                                            accept="application/pdf"
                                            multiple
                                            disabled={remainingSlots <= 0}
                                            onChange={handleInvoiceFilesChange}
                                        />
                                        {invoiceForm.errors.invoice_pdfs && (
                                            <p className="text-xs text-red-600">
                                                {invoiceForm.errors.invoice_pdfs}
                                            </p>
                                        )}
                                        <Button
                                            type="submit"
                                            disabled={
                                                invoiceForm.processing ||
                                                invoiceForm.data.invoice_pdfs.length === 0 ||
                                                remainingSlots <= 0
                                            }
                                            size="sm"
                                        >
                                            {invoiceForm.processing ? 'Uploading...' : 'Upload'}
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Inspection Fee</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-2xl font-semibold text-gray-900">
                                {formatCurrency(order.inspection_fee)}
                            </p>
                            {order.inspection_fee_note && (
                                <p className="text-sm text-vw-grey">{order.inspection_fee_note}</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Konfirmasi ubah status (maju) */}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Status Change</DialogTitle>
                        <DialogDescription>
                            Change order status from{' '}
                            <strong>{STATUS_LABEL[order.status]}</strong> to{' '}
                            <strong>{pendingStatus && STATUS_LABEL[pendingStatus]}</strong>?
                            This action will be recorded and cannot be easily undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmOpen(false)}
                            disabled={processing}
                        >
                            Cancel
                        </Button>
                        <Button onClick={confirmStatusChange} disabled={processing}>
                            {processing ? 'Saving...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Konfirmasi revert status (mundur, admin only) */}
            <Dialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Revert Status</DialogTitle>
                        <DialogDescription>
                            Revert order status from{' '}
                            <strong>{STATUS_LABEL[order.status]}</strong> back to{' '}
                            <strong>{revertTarget && STATUS_LABEL[revertTarget]}</strong>?
                            Use this only if items need to be reopened for negotiation.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRevertConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={confirmRevertStatus}>Confirm Revert</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}