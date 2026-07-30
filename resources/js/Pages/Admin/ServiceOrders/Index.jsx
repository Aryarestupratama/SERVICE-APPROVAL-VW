import AdminLayout from '@/Layouts/AdminLayout';
import { Link } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/Components/ui/table';
import { Badge } from '@/Components/ui/badge';

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

export default function Index({ orders }) {
    return (
        <AdminLayout title="Service Orders">
            <div className="mb-4 flex justify-end">
                <Button asChild>
                    <Link href={route('admin.service-orders.create')}>Add Service Order</Link>
                </Button>
            </div>
            <div className="rounded-lg border border-vw-grey/20 bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Service Advisor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Inspection Fee</TableHead>
                            <TableHead className="w-1"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-vw-grey">
                                    No service orders yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {orders.data.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">
                                    {order.vehicle?.customer?.name ?? '—'}
                                </TableCell>
                                <TableCell>
                                    {order.vehicle
                                        ? `${order.vehicle.brand} ${order.vehicle.model} · ${order.vehicle.plate_number}`
                                        : '—'}
                                </TableCell>
                                <TableCell>{order.service_advisor?.name ?? '—'}</TableCell>
                                <TableCell>
                                    <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                                        {STATUS_LABEL[order.status] ?? order.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    {new Intl.NumberFormat('id-ID', {
                                        style: 'currency',
                                        currency: 'IDR',
                                        maximumFractionDigits: 0,
                                    }).format(order.inspection_fee)}
                                </TableCell>
                                <TableCell>
                                    <Link
                                        href={route('admin.service-orders.show', order.id)}
                                        className="text-sm font-medium text-vw-light-blue hover:underline"
                                    >
                                        View
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {orders.links.length > 3 && (
                <div className="mt-4 flex flex-wrap gap-1">
                    {orders.links.map((link, i) => (
                        <Link
                            key={i}
                            href={link.url ?? '#'}
                            preserveScroll
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
        </AdminLayout>
    );
}