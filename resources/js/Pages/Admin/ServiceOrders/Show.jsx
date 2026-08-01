import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm } from '@inertiajs/react';
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

// Sinkron dengan ServiceOrderController::ALLOWED_TRANSITIONS (backend tetap
// jadi sumber kebenaran/validasi terakhir — ini cuma untuk UX, supaya user
// nggak lihat opsi yang bakal ditolak backend).
const ALLOWED_TRANSITIONS = {
    scheduled: ['in_progress'],
    in_progress: ['quality_control', 'all_rejected_cancelled'],
    quality_control: ['follow_up'],
    follow_up: ['completed'],
};

const STATUS_VARIANT = {
    scheduled: 'secondary',
    in_progress: 'default',
    quality_control: 'default',
    follow_up: 'default',
    completed: 'success',
    all_rejected_cancelled: 'destructive',
};

const STATUS_LABEL = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    quality_control: 'Quality Control',
    follow_up: 'Follow Up',
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

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
}

// Total per item: pakai final_price_snapshot kalau sudah terkunci (approved),
// kalau belum (pending/rejected) hitung on-the-fly dari cost - discount.
// Ini cuma untuk tampilan; sumber kebenaran hitungan tetap
// InspectionItemPricingService di backend.
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

// Subtotal pre-PPN, dihitung ulang dari raw fields (cost_item/cost_labour/diskon)
// yang tetap tersimpan meski item sudah locked — jadi konsisten dipakai untuk
// SEMUA item (approved maupun belum), tidak bergantung final_price_snapshot.
function itemSubtotal(item) {
    const itemAfterDiscount =
        Number(item.cost_item) * (1 - Number(item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount =
        Number(item.cost_labour) * (1 - Number(item.discount_labour_percent ?? 0) / 100);

    return itemAfterDiscount + labourAfterDiscount;
}

export default function Show({ order, settings }) {
    const [pendingStatus, setPendingStatus] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // FIX: status harus ada di form state (useForm), bukan dititip lewat
    // options.data saat patch() — Inertia selalu mengirim form.data, jadi
    // options.data diabaikan dan sebelumnya request terkirim kosong.
    const { setData, patch, processing } = useForm({ status: '' });
    const invoiceForm = useForm({ invoice_pdf: null });

    const availableTransitions = ALLOWED_TRANSITIONS[order.status] ?? [];

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

    const handleInvoiceUpload = (e) => {
        e.preventDefault();
        invoiceForm.post(route('admin.service-orders.upload-invoice', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => invoiceForm.reset(),
        });
    };

    // Breakdown PPN: subtotal dihitung dari raw cost fields (konsisten untuk
    // semua item), PPN & grand total mengikuti settings.ppn_percent — pola
    // yang sama dengan InspectionItemPricingService::lockFinalPrice() di backend.
    const ppnPercent = Number(settings?.ppn_percent ?? 0);
    const subtotal =
        order.inspection_items?.reduce((sum, item) => sum + itemSubtotal(item), 0) ?? 0;
    const ppnAmount = subtotal * (ppnPercent / 100);
    const grandTotal = subtotal + ppnAmount;

    // 'completed' hanya boleh dipilih kalau invoice sudah diupload — guard ini
    // cuma UX, backend tetap validasi ulang di updateStatus().
    const isCompletedBlocked =
        !order.invoice_pdf_path && availableTransitions.includes('completed');

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
                                {order.status === 'follow_up' && (
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
                                <p className="text-vw-grey">NIK (Nomor Identitas Kendaraan)</p>
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
                                                    <p className="font-medium text-gray-900">
                                                        {item.name}
                                                        {item.is_urgent && (
                                                            <Badge
                                                                variant="destructive"
                                                                className="ml-2 align-middle"
                                                            >
                                                                Urgent
                                                            </Badge>
                                                        )}
                                                    </p>
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
                                                    <span className="block">Item price</span>
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
                                            <p className="text-vw-grey">PPN ({ppnPercent}%)</p>
                                            <p className="text-gray-900">{formatCurrency(ppnAmount)}</p>
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
                                                    disabled={
                                                        status === 'completed' &&
                                                        !order.invoice_pdf_path
                                                    }
                                                >
                                                    {STATUS_LABEL[status]}
                                                    {status === 'completed' &&
                                                        !order.invoice_pdf_path &&
                                                        ' (upload invoice first)'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {isCompletedBlocked && (
                                        <p className="text-xs text-red-600">
                                            Upload invoice PDF dulu sebelum bisa menandai order
                                            completed.
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
                            <CardTitle>Invoice PDF</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {order.invoice_pdf_path ? (
                                <div className="space-y-1">
                                    <a
                                        href={`/storage/${order.invoice_pdf_path}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 underline"
                                    >
                                        View current invoice
                                    </a>
                                    {order.invoice_uploaded_at && (
                                        <p className="text-xs text-vw-grey">
                                            Uploaded{' '}
                                            {new Date(order.invoice_uploaded_at).toLocaleString(
                                                'id-ID'
                                            )}
                                            {order.invoice_uploaded_by?.name &&
                                                ` by ${order.invoice_uploaded_by.name}`}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-vw-grey">No invoice uploaded yet.</p>
                            )}

                            {order.status !== 'completed' && (
                                <form onSubmit={handleInvoiceUpload} className="space-y-2">
                                    <Label htmlFor="invoice_pdf">
                                        {order.invoice_pdf_path
                                            ? 'Replace invoice'
                                            : 'Upload invoice'}{' '}
                                        (PDF)
                                    </Label>
                                    <Input
                                        id="invoice_pdf"
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) =>
                                            invoiceForm.setData(
                                                'invoice_pdf',
                                                e.target.files[0]
                                            )
                                        }
                                    />
                                    {invoiceForm.errors.invoice_pdf && (
                                        <p className="text-xs text-red-600">
                                            {invoiceForm.errors.invoice_pdf}
                                        </p>
                                    )}
                                    <Button
                                        type="submit"
                                        disabled={
                                            invoiceForm.processing || !invoiceForm.data.invoice_pdf
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