import { useEffect, useRef, useState, useCallback } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AdminLayout from '@/Layouts/AdminLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/Components/ui/card';
import { Badge } from '@/Components/ui/badge';
import { AlertTriangle, Car, Wrench, ClipboardCheck, FileText } from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';

const STATUS_LABELS = {
    appointment: 'Appointment',
    work_in_progress: 'Work in Progress',
    quality_control: 'Quality Control',
    invoice_preparation: 'Invoice Preparation',
    completed: 'Completed',
    all_rejected_cancelled: 'Cancelled',
};

// Statuses that count as "currently in the shop" — excludes appointment
// (not arrived yet), completed and cancelled (both are done). Order here
// doubles as the pipeline order shown in each card's status stepper.
const IN_PROGRESS_STATUSES = ['work_in_progress', 'quality_control', 'invoice_preparation'];

const STATUS_ICONS = {
    work_in_progress: Wrench,
    quality_control: ClipboardCheck,
    invoice_preparation: FileText,
};

const REASON_LABELS = {
    waiting_for_parts: 'Menunggu Part',
    waiting_for_pickup: 'Menunggu Diambil',
};

const REASON_VARIANT = {
    waiting_for_parts: 'destructive',
    waiting_for_pickup: 'secondary',
};

const CHART_RANGES = [
    { value: 7, label: '7 Days' },
    { value: 30, label: '30 Days' },
];

// How often to check for changes (poll the lightweight signature endpoint),
// and how long to pause when the tab isn't visible — mirrors the pattern
// already used on Show.jsx / InspectionReport.jsx (PROJECT-RULES §12).
const POLL_INTERVAL_MS = 5000;

function formatIDR(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

// Y-axis ticks for the revenue chart, expressed in Rp Juta (millions) per
// the owner's request — plain numbers, unit is spelled out once in the
// card's subtitle instead of repeated on every tick.
function formatRpJuta(value) {
    return (Number(value ?? 0) / 1_000_000).toLocaleString('id-ID', {
        maximumFractionDigits: 1,
    });
}

function RangeToggle({ value, onChange }) {
    return (
        <div role="group" aria-label="Chart range" className="inline-flex rounded-lg border p-1">
            {CHART_RANGES.map((range) => (
                <button
                    key={range.value}
                    type="button"
                    aria-pressed={value === range.value}
                    onClick={() => onChange(range.value)}
                    className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        value === range.value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {range.label}
                </button>
            ))}
        </div>
    );
}

function IntakeTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const count = payload[0].value;
    return (
        <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground">
                {count} {count === 1 ? 'car in' : 'cars in'}
            </p>
        </div>
    );
}

function RevenueTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground">{formatIDR(payload[0].value)}</p>
        </div>
    );
}

// Small pipeline indicator: 3 dots for work_in_progress -> quality_control ->
// invoice_preparation, connected by a line. Dots up to and including the
// current status are filled; the rest stay muted. Encodes "how far along"
// at a glance instead of just naming the status.
function StatusStepper({ status }) {
    const currentIndex = IN_PROGRESS_STATUSES.indexOf(status);

    return (
        <div className="flex items-center">
            {IN_PROGRESS_STATUSES.map((step, index) => (
                <div key={step} className="flex items-center">
                    <div
                        className={`h-1.5 w-1.5 rounded-full ${
                            index <= currentIndex ? 'bg-primary' : 'bg-border'
                        }`}
                    />
                    {index < IN_PROGRESS_STATUSES.length - 1 && (
                        <div
                            className={`h-px w-4 ${index < currentIndex ? 'bg-primary' : 'bg-border'}`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

function InProgressCard({ order }) {
    const Icon = STATUS_ICONS[order.status] ?? Wrench;

    return (
        <Link
            href={route('admin.service-orders.show', order.id)}
            className="group flex w-full flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
        >
            <div className="flex items-start justify-between">
                <div
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                    <Icon className="h-4 w-4" />
                </div>
                <Badge variant="outline" className="text-[11px]">
                    {order.days_ago}d in status
                </Badge>
            </div>

            <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                    {order.work_order_number ?? `Order #${order.id}`}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                    {order.plate_number ?? '—'} · {order.customer_name ?? 'Unknown customer'}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                    SA: {order.service_advisor_name ?? 'Unassigned'}
                </p>
            </div>

            <div className="mt-auto flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                    {STATUS_LABELS[order.status] ?? order.status}
                </span>
                <StatusStepper status={order.status} />
            </div>
        </Link>
    );
}

// Polls the lightweight signature endpoint; when it changes, pulls the full
// In Progress list via a plain fetch and hands it back through onUpdate —
// same "cheap check, expensive fetch only on change" shape as §12.4, just
// implemented with fetch() here instead of router.reload() since this data
// isn't part of the page's own Inertia props lifecycle.
function useInProgressPolling(initialOrders) {
    const [orders, setOrders] = useState(initialOrders);
    const [isLive, setIsLive] = useState(true);
    const knownSignature = useRef(null);

    const checkForUpdates = useCallback(async () => {
        try {
            const res = await fetch(route('admin.dashboard.in-progress-activity'), {
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error('activity check failed');
            const { signature } = await res.json();
            setIsLive(true); // cek berhasil = koneksi sehat, walau tidak ada perubahan

            if (knownSignature.current === null) {
                knownSignature.current = signature;
                return;
            }
            if (signature === knownSignature.current) return;

            knownSignature.current = signature;
            // Tile status & Needs Attention bukan bagian dari feed In Progress; muat ulang juga.
            router.reload({ only: ['statusCounts', 'actionItems', 'actionItemsTotal'], preserveScroll: true, preserveState: true });
            const feedRes = await fetch(route('admin.dashboard.in-progress-feed'), {
                headers: { Accept: 'application/json' },
            });
            if (!feedRes.ok) throw new Error('feed fetch failed');
            const { inProgressOrders } = await feedRes.json();
            setOrders(inProgressOrders);
            setIsLive(true);
        } catch {
            // Silent by design — a missed poll just tries again next
            // interval, no need to alarm the user over one dropped request.
            setIsLive(false);
        }
    }, []);

    useEffect(() => {
        let intervalId;

        const start = () => {
            checkForUpdates();
            clearInterval(intervalId);
            intervalId = setInterval(checkForUpdates, POLL_INTERVAL_MS);
        };
        const stop = () => clearInterval(intervalId);

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                stop();
            } else {
                start();
            }
        };

        if (document.visibilityState !== 'hidden') start();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [checkForUpdates]);

    return { orders, isLive };
}

export default function Dashboard({
    statusCounts,
    actionItems,
    actionItemsTotal,
    stuckThresholdDays,
    inProgressOrders: initialInProgressOrders = [],
    carsInByRange = {},
    revenueByRange = {},
}) {
    const [range, setRange] = useState(7);
    const { orders: inProgressOrders, isLive } = useInProgressPolling(initialInProgressOrders);

    const attentionTotal = actionItemsTotal ?? actionItems.length;
    const weeklyIntake = carsInByRange[range] ?? [];
    const weeklyRevenue = revenueByRange[range] ?? [];
    const totalIntake = weeklyIntake.reduce((sum, d) => sum + (d.count ?? 0), 0);
    const totalRevenue = weeklyRevenue.reduce((sum, d) => sum + (d.amount ?? 0), 0);

    return (
        <AdminLayout title="Dashboard">
            <Head title="Dashboard" />

                        {/* Needs attention */}
            <Card className={`mb-6 ${actionItems.length > 0 ? 'border-urgent/40' : ''}`}>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-urgent" />
                        <CardTitle className="text-sm font-semibold">
                            Needs Attention ({attentionTotal})
                        </CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Orders stuck &gt; {stuckThresholdDays} days in Work in Progress (waiting for parts) or Invoice Preparation (waiting for pickup).
                    </p>
                    {attentionTotal > actionItems.length && (
                        <p className="text-xs text-muted-foreground">
                            Showing the {actionItems.length} longest-waiting of {attentionTotal}.
                        </p>
                    )}
                </CardHeader>
                <CardContent>
                    {actionItems.length === 0 ? (
                        <p className="py-2 text-center text-sm text-muted-foreground">
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
                                            {item.service_advisor_name ?? 'Unassigned'} · {STATUS_LABELS[item.status] ?? item.status} · {item.days_ago}d in this status
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


            {/* Hero: In Progress — the shop's live state, front and center */}
            <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <CardTitle className="text-base font-semibold">
                                In Progress ({inProgressOrders.length})
                            </CardTitle>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <span className="relative flex h-2 w-2">
                                    {isLive && (
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
                                    )}
                                    <span
                                        className={`relative inline-flex h-2 w-2 rounded-full ${
                                            isLive ? 'bg-emerald-500' : 'bg-muted-foreground'
                                        }`}
                                    />
                                </span>
                                {isLive ? 'Live' : 'Reconnecting…'}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Vehicles currently in the shop — updates automatically as status changes.
                    </p>
                </CardHeader>
                <CardContent>
                    {inProgressOrders.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            No vehicles currently in the shop.
                        </p>
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-3">
                            {IN_PROGRESS_STATUSES.map((status) => {
                                const list = inProgressOrders.filter((o) => o.status === status);
                                return (
                                    <div key={status} className="min-w-0 space-y-2">
                                        <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                                            <span>{STATUS_LABELS[status]}</span>
                                            <span className="text-muted-foreground">{list.length}</span>
                                        </div>
                                        {list.length === 0 ? (
                                            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                                                None
                                            </p>
                                        ) : (
                                            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                                                {list.map((order) => (
                                                    <InProgressCard key={order.id} order={order} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Status overview */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <Link
                        key={key}
                        href={route('admin.service-orders.index', { status: key })}
                        className="block rounded-lg transition-colors hover:ring-1 hover:ring-primary/40"
                    >
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-medium text-muted-foreground">
                                {label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">{statusCounts[key] ?? 0}</p>
                        </CardContent>
                    </Card>
                    </Link>
                ))}
            </div>

            {/* Shared range control for both charts below */}
            <div className="mb-3 flex items-center justify-start">
                <RangeToggle value={range} onChange={setRange} />
            </div>

            {/* Charts */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="pb-1">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">
                                Cars In — Last {range} Days
                            </CardTitle>
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                                {totalIntake}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-48" role="img" aria-label={`Cars in per day, last ${range} days, total ${totalIntake}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeklyIntake} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={11}
                                        interval={range > 7 ? 'preserveStartEnd' : 0}
                                        className="fill-muted-foreground"
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={11}
                                        width={28}
                                        className="fill-muted-foreground"
                                    />
                                    <Tooltip content={<IntakeTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-1">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">
                                Revenue — Last {range} Days
                            </CardTitle>
                            <span className="text-sm font-semibold">{formatIDR(totalRevenue)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Amounts in Rp Juta (millions). Approved items incl. VAT on orders completed that day; inspection fee not included.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-48" role="img" aria-label={`Revenue per day, last ${range} days, total ${formatIDR(totalRevenue)}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={weeklyRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={11}
                                        interval={range > 7 ? 'preserveStartEnd' : 0}
                                        className="fill-muted-foreground"
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={11}
                                        width={32}
                                        tickFormatter={formatRpJuta}
                                        className="fill-muted-foreground"
                                    />
                                    <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        fill="url(#revenueFill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}