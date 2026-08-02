import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, router } from '@inertiajs/react';
import { Badge } from '@/Components/ui/badge';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';

const ALLOWED_TRANSITIONS = {
    appointment: ['work_in_progress'],
    work_in_progress: ['quality_control', 'all_rejected_cancelled'],
    quality_control: ['invoice_preparation'],
    invoice_preparation: ['completed'],
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

const GROUP_VARIANT = {
    related: 'destructive',
    safety: 'default',
    durability: 'secondary',
    experience: 'secondary',
    appearance: 'outline',
};

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
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

// Breakdown subtotal/VAT/grand total per kelompok — pola sama dengan breakdown
// gabungan, cuma di-scope filter per group.
function groupBreakdown(items, group, vatPercent) {
    const groupItems = items.filter((item) => item.group === group);
    const subtotal = groupItems.reduce((sum, item) => sum + itemSubtotal(item), 0);
    const vatAmount = subtotal * (vatPercent / 100);
    return {
        items: groupItems,
        subtotal,
        vatAmount,
        grandTotal: subtotal + vatAmount,
    };
}

function sortedInvoices(invoices) {
    return [...(invoices ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

// Map estimationDocuments (array, bisa cuma sebagian group yang ada baris-nya)
// jadi lookup by group — supaya gampang render 5 slot tetap termasuk yang
// belum pernah diupload (undefined).
function estimationDocsByGroup(docs) {
    const map = {};
    (docs ?? []).forEach((doc) => {
        map[doc.group] = doc;
    });
    return map;
}

export default function Show({ order, settings, maxInvoices }) {
    const [pendingStatus, setPendingStatus] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Group mana yang lagi dipilih file-nya di form upload estimation form,
    // supaya 1 form bisa dipakai untuk semua slot (bukan 5 form terpisah).
    const [selectedGroup, setSelectedGroup] = useState(null);

    const { setData, patch, processing } = useForm({ status: '' });
    const invoiceForm = useForm({ invoice_pdfs: [] });
    const estimationForm = useForm({ group: '', pdf: null });

    const availableTransitions = ALLOWED_TRANSITIONS[order.status] ?? [];
    const invoices = sortedInvoices(order.invoices);
    const hasInvoice = invoices.length > 0;
    const remainingSlots = (maxInvoices ?? 5) - invoices.length;

    const docsByGroup = estimationDocsByGroup(order.estimation_documents);
    const vatPercent = Number(settings?.ppn_percent ?? 0);
    const canEditEstimationDocs = order.status === 'work_in_progress';

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

    const subtotal =
        order.inspection_items?.reduce((sum, item) => sum + itemSubtotal(item), 0) ?? 0;
    const vatAmount = subtotal * (vatPercent / 100);
    const grandTotal = subtotal + vatAmount;

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

                    <Card>
                        <CardHeader>
                            <CardTitle>Inspection Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {order.inspection_items?.length ? (
                                <div className="divide-y divide-vw-grey/10">
                                    {order.inspection_items.map((item) => (
                                        <div key={item.id} className="space-y-2 py-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium text-gray-900">
                                                        {item.name}
                                                        {item.group && (
                                                            <Badge
                                                                variant={
                                                                    GROUP_VARIANT[item.group] ??
                                                                    'secondary'
                                                                }
                                                                className="ml-2 align-middle"
                                                            >
                                                                {GROUP_LABEL[item.group] ?? item.group}
                                                            </Badge>
                                                        )}
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
                                                            ? new Date(item.decided_at).toLocaleString(
                                                                  'id-ID'
                                                              )
                                                            : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="space-y-1 pt-3">
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
                                            <p className="font-semibold text-gray-900">
                                                {formatCurrency(grandTotal)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-vw-grey">No inspection items yet.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Breakdown per kelompok — subtotal/VAT/grand total masing-masing
                        group, plus daftar item di dalamnya. Cuma group yang punya
                        minimal 1 item yang ditampilkan. */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Cost Breakdown by Group</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {GROUPS.map((group) => {
                                const breakdown = groupBreakdown(
                                    order.inspection_items ?? [],
                                    group,
                                    vatPercent
                                );

                                if (breakdown.items.length === 0) return null;

                                return (
                                    <div
                                        key={group}
                                        className="rounded-lg border border-vw-grey/10 p-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <Badge variant={GROUP_VARIANT[group] ?? 'secondary'}>
                                                {GROUP_LABEL[group]}
                                            </Badge>
                                            <span className="text-xs text-vw-grey">
                                                {breakdown.items.length} item
                                                {breakdown.items.length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="mt-2 space-y-1 text-sm">
                                            <div className="flex items-center justify-between text-vw-grey">
                                                <span>Subtotal</span>
                                                <span>{formatCurrency(breakdown.subtotal)}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-vw-grey">
                                                <span>VAT ({vatPercent}%)</span>
                                                <span>{formatCurrency(breakdown.vatAmount)}</span>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-vw-grey/10 pt-1 font-medium text-gray-900">
                                                <span>Group Total</span>
                                                <span>{formatCurrency(breakdown.grandTotal)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {(order.inspection_items?.length ?? 0) === 0 && (
                                <p className="text-sm text-vw-grey">No inspection items yet.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Estimation Forms per group — 5 slot tetap, tiap slot bisa
                        upload/replace/hapus independen. Hanya editable saat
                        work_in_progress. */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Estimation Forms</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {!canEditEstimationDocs && (
                                <p className="text-xs text-vw-grey">
                                    Estimation forms can only be uploaded or changed while the
                                    order is at Work In Progress.
                                </p>
                            )}

                            {GROUPS.map((group) => {
                                const doc = docsByGroup[group];
                                const hasFile = doc?.pdf_path;

                                return (
                                    <div
                                        key={group}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-vw-grey/10 p-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <Badge variant={GROUP_VARIANT[group] ?? 'secondary'}>
                                                {GROUP_LABEL[group]}
                                            </Badge>

                                            {hasFile ? (
                                                <div className="mt-1.5 space-y-0.5">
                                                    <aa
                                                        href={`/storage/${doc.pdf_path}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-blue-600 underline"
                                                    >
                                                        View current file
                                                    </aa>
                                                    {doc.uploaded_at && (
                                                        <p className="text-xs text-vw-grey">
                                                            Uploaded{' '}
                                                            {new Date(
                                                                doc.uploaded_at
                                                            ).toLocaleString('id-ID')}
                                                            {doc.uploaded_by?.name &&
                                                                ` by ${doc.uploaded_by.name}`}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="mt-1.5 text-sm text-vw-grey">
                                                    No file uploaded yet.
                                                </p>
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
                                                            handleEstimationFileChange(
                                                                group,
                                                                e.target.files[0]
                                                            )
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
                                                        {estimationForm.processing &&
                                                        selectedGroup === group
                                                            ? 'Uploading...'
                                                            : hasFile
                                                            ? 'Replace'
                                                            : 'Upload'}
                                                    </Button>
                                                </form>
                                            )}
                                            {selectedGroup === group &&
                                                estimationForm.errors.pdf && (
                                                    <p className="mt-1 text-xs text-red-600">
                                                        {estimationForm.errors.pdf}
                                                    </p>
                                                )}
                                        </div>

                                        {hasFile && canEditEstimationDocs && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="shrink-0 text-red-600 hover:text-red-700"
                                                onClick={() => handleDeleteEstimationDoc(doc)}
                                            >
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
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
                        </CardContent>
                    </Card>

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
                                                        Uploaded{' '}
                                                        {new Date(invoice.uploaded_at).toLocaleString(
                                                            'id-ID'
                                                        )}
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

            {/* Konfirmasi ubah status */}
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
        </AdminLayout>
    );
}