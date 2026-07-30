import AdminLayout from '@/Layouts/AdminLayout';
import { Head } from '@inertiajs/react';

const STATUS_LABEL = {
    draft: 'Draft',
    sent: 'Sent',
    awaiting_approval: 'Awaiting Approval',
    approved: 'Approved',
    all_rejected_cancelled: 'All Rejected',
    in_progress: 'In Progress',
    completed: 'Completed',
    invoiced: 'Invoiced',
};

const STATUS_ORDER = [
    'draft',
    'sent',
    'awaiting_approval',
    'approved',
    'in_progress',
    'completed',
    'invoiced',
    'all_rejected_cancelled',
];

export default function Dashboard({ ordersByStatus }) {
    const totalOrders = Object.values(ordersByStatus).reduce(
        (sum, orders) => sum + orders.length,
        0
    );

    return (
        <AdminLayout title="Dashboard">
            <Head title="Dashboard" />

            {totalOrders === 0 ? (
                <div className="rounded-lg border border-dashed border-vw-grey/30 bg-white px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-900">
                        No service orders yet
                    </p>
                    <p className="mt-1 text-sm text-vw-grey">
                        Service orders will appear here, grouped by status.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {STATUS_ORDER.map((status) => {
                        const orders = ordersByStatus[status] ?? [];

                        return (
                            <div key={status} className="rounded-lg border border-vw-grey/20 bg-white">
                                <div className="border-b border-vw-grey/20 px-4 py-3">
                                    <p className="text-sm font-semibold text-gray-900">
                                        {STATUS_LABEL[status] ?? status}
                                    </p>
                                    <p className="text-xs text-vw-grey">
                                        {orders.length} orders
                                    </p>
                                </div>

                                <div className="space-y-2 p-3">
                                    {orders.length === 0 ? (
                                        <p className="px-1 py-2 text-xs text-vw-grey">
                                            Empty
                                        </p>
                                    ) : (
                                        orders.map((order) => (
                                            <div
                                                key={order.id}
                                                className="rounded-md border border-vw-grey/15 bg-vw-grey-light px-3 py-2"
                                            >
                                                <p className="text-sm font-medium text-gray-900">
                                                    {order.vehicle?.plate_number ?? '—'}
                                                </p>
                                                <p className="text-xs text-vw-grey">
                                                    {order.vehicle?.customer?.name ?? 'Unknown customer'}
                                                </p>
                                                <p className="mt-1 text-xs text-vw-grey">
                                                    SA: {order.service_advisor?.name ?? '—'}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </AdminLayout>
    );
}