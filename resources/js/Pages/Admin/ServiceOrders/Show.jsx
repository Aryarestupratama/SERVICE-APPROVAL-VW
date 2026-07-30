import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm } from '@inertiajs/react';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
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

const STATUS_VARIANT = {
    draft: 'secondary',
    sent: 'secondary',
    awaiting_approval: 'default',
    approved: 'success',
    all_rejected_cancelled: 'destructive',
    in_progress: 'default',
    completed: 'success',
    invoiced: 'success',
};

const STATUS_LABEL = {
    draft: 'Draft',
    sent: 'Sent',
    awaiting_approval: 'Awaiting Approval',
    approved: 'Approved',
    all_rejected_cancelled: 'Rejected & Cancelled',
    in_progress: 'In Progress',
    completed: 'Completed',
    invoiced: 'Invoiced',
};

// Sesuai validasi controller: Rule::in(['approved','in_progress','completed','invoiced'])
const MANUAL_STATUS_OPTIONS = ['approved', 'in_progress', 'completed', 'invoiced'];

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);
}

export default function Show({ order }) {
    const [pendingStatus, setPendingStatus] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { patch, processing } = useForm({});

    const handleSelectStatus = (value) => {
        setPendingStatus(value);
        setConfirmOpen(true);
    };

    const confirmStatusChange = () => {
        patch(route('admin.service-orders.update-status', order.id), {
            data: { status: pendingStatus },
            preserveScroll: true,
            onFinish: () => {
                setConfirmOpen(false);
                setPendingStatus(null);
            },
        });
    };

    const totalItemsCost = order.inspection_items?.reduce(
        (sum, item) => sum + Number(item.cost),
        0
    ) ?? 0;

    return (
        <AdminLayout title={`Service Order #${order.id}`}>
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Kolom kiri: info utama */}
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Order Overview</CardTitle>
                            <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                                {STATUS_LABEL[order.status] ?? order.status}
                            </Badge>
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
                                <p className="text-vw-grey">Service Advisor</p>
                                <p className="font-medium text-gray-900">
                                    {order.service_advisor?.name ?? '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-vw-grey">Technician</p>
                                <p className="font-medium text-gray-900">
                                    {order.technician?.name ?? '—'}
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
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between py-3"
                                        >
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
                                                    {formatCurrency(item.cost)}
                                                </p>
                                                <Badge
                                                    variant={
                                                        item.status === 'approved'
                                                            ? 'success'
                                                            : item.status === 'rejected'
                                                            ? 'destructive'
                                                            : 'secondary'
                                                    }
                                                >
                                                    {item.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between pt-3">
                                        <p className="font-semibold text-gray-900">Total</p>
                                        <p className="font-semibold text-gray-900">
                                            {formatCurrency(totalItemsCost)}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-vw-grey">No inspection items yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Kolom kanan: status control */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Update Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Select
                                value={order.status}
                                onValueChange={handleSelectStatus}
                                disabled={processing}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {MANUAL_STATUS_OPTIONS.map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {STATUS_LABEL[status]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-vw-grey">
                                Only statuses admin/SA can set manually are listed. Earlier
                                stages (draft, sent, awaiting approval) are system-driven.
                            </p>
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