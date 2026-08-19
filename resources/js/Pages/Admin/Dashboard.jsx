import { Head, Link } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { Badge } from '@/Components/ui/badge';
import { AlertTriangle } from 'lucide-react';

const STATUS_LABELS = {
    appointment: 'Appointment',
    work_in_progress: 'Work in Progress',
    quality_control: 'Quality Control',
    invoice_preparation: 'Invoice Preparation',
    completed: 'Completed',
    all_rejected_cancelled: 'Cancelled',
};

const REASON_LABELS = {
    waiting_for_parts: 'Menunggu Part',
    waiting_for_pickup: 'Menunggu Diambil',
};

const REASON_VARIANT = {
    waiting_for_parts: 'destructive',
    waiting_for_pickup: 'secondary',
};

export default function Dashboard({ statusCounts, actionItems, stuckThresholdDays }) {
    return (
        <AdminLayout title="Dashboard">
            <Head title="Dashboard" />
            
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <Card key={key}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-medium text-muted-foreground">
                                {label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{statusCounts[key] ?? 0}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-urgent" />
                        <CardTitle className="text-sm font-semibold">
                            Needs Attention ({actionItems.length})
                        </CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Orders stuck &gt; {stuckThresholdDays} days in Work in Progress (waiting for parts) or Invoice Preparation (waiting for pickup).
                    </p>
                </CardHeader>
                <CardContent>
                    {actionItems.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Nothing needs attention right now. 🎉
                        </p>
                    ) : (
                        <div className="divide-y">
                            {actionItems.map((item) => (
                                <Link
                                    key={item.id}
                                    href={route('admin.service-orders.show', item.id)}
                                    className="flex flex-col gap-2 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {item.work_order_number ?? `Order #${item.id}`} — {item.plate_number ?? '—'}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.service_advisor_name ?? 'Unassigned'} · {STATUS_LABELS[item.status] ?? item.status} · {item.days_ago}d ago
                                        </p>
                                    </div>
                                    <div className="flex flex-shrink-0 flex-wrap gap-1 sm:justify-end">
                                        {item.reasons.map((reason) => (
                                            <Badge key={reason} variant={REASON_VARIANT[reason] ?? 'secondary'}>
                                                {REASON_LABELS[reason] ?? reason}
                                            </Badge>
                                        ))}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </AdminLayout>
    );
}