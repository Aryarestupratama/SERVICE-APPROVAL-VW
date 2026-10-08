import { useState, useEffect, useRef, useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { router, Head, usePage } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Ban, CircleCheck, Clock, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
import { DataTable } from '@/Components/DataTable/DataTable';
import { useDataTable } from '@/Components/DataTable/useDataTable';
import { DataTableSearchInput } from '@/Components/DataTable/DataTableSearchInput';
import { DataTableFilterPanel } from '@/Components/DataTable/DataTableFilterPanel';

// Halaman FUAS In Process / FUAS Completed (FR-027..FR-029, SCR-016/017).
// Status FUAS SELALU dari server (FuasStatusService, RULE-036): klien hanya menampilkan
// `fuas.status` dan `fuas.can_send` dan tidak menghitung ulang dari tanggal.

const MAX_SENT = 2;

const STATUS_LABEL = {
    to_send: 'To Send',
    sent_1: 'Sent (1)',
    reminder_due: 'Reminder Due',
    sent_2: 'Sent (2)',
    no_feedback: 'No Feedback',
    feedback_received: 'Feedback Received',
};

// Gaya badge (Design 4A): tidak hanya warna, selalu ada ikon + teks (RULE-060).
const STATUS_STYLE = {
    to_send: { Icon: TriangleAlert, className: 'border-amber-700/30 bg-amber-50 text-amber-700' },
    reminder_due: { Icon: TriangleAlert, className: 'border-amber-700/30 bg-amber-50 text-amber-700' },
    sent_1: { Icon: Clock, className: 'border-vw-grey/30 bg-gray-50 text-gray-700' },
    sent_2: { Icon: Clock, className: 'border-vw-grey/30 bg-gray-50 text-gray-700' },
    no_feedback: { Icon: Ban, className: 'border-vw-grey/30 bg-gray-50 text-gray-600' },
    feedback_received: { Icon: CircleCheck, className: 'border-approved/30 bg-approved/10 text-approved' },
};

const GROUP_TITLE = {
    in_process: 'FUAS In Process',
    completed: 'FUAS Completed',
};

// wa.me butuh format internasional tanpa 0/+ di depan (RULE-013), dinormalisasi di titik pemakaian.
const toWaDigits = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0')) return `62${d.slice(1)}`;
    return d;
};

// Zona waktu Asia/Jakarta, konsisten dengan konvensi project (RULE-014: tanpa toISOString).
const JAKARTA_DATE = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});
const JAKARTA_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

const formatDate = (value) => (value ? JAKARTA_DATE.format(new Date(value)) : '—');
const formatDateTime = (value) => (value ? JAKARTA_DATE_TIME.format(new Date(value)) : '—');

// Sapaan menurut jam Jakarta. Rentang jam [Assumption]; template di Design.md 4A hanya menyebut pagi/siang/sore.
function greetingNow() {
    const hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
    );
    if (hour >= 18 || hour < 4) return 'malam';
    if (hour >= 15) return 'sore';
    if (hour >= 11) return 'siang';
    return 'pagi';
}

// Isi pesan WhatsApp ke customer berbahasa Indonesia (RULE-010); template: Design.md 4A (OQ-11).
function buildMessage({ messageNumber, customerName, vehicleLabel, link }) {
    const greeting = `Selamat ${greetingNow()} Bapak/Ibu ${customerName}`;

    if (messageNumber >= 2) {
        return `${greeting}, kami mengingatkan kembali untuk mengisi formulir feedback terkait kunjungan Anda ke VW PIK melalui link berikut: ${link}. Masukan Anda sangat berarti bagi kami. Terima kasih.`;
    }

    return `${greeting}, terima kasih telah mempercayakan perawatan ${vehicleLabel} Anda kepada VW PIK. Kami ingin mendengar pengalaman Anda. Mohon kesediaannya mengisi formulir feedback singkat melalui link berikut: ${link}. Terima kasih.`;
}

// Pesan error menurut status HTTP (RULE-041, RULE-042).
function errorMessageFor(status, serverMessage) {
    switch (status) {
        case 403:
            return 'You do not have access to this service order.';
        case 409:
            return serverMessage || 'This order is no longer ready to send. The list has been refreshed.';
        case 419:
            return 'Your session expired. Reload the page and try again.';
        case 429:
            return 'Too many requests. Wait a moment and try again.';
        default:
            return 'Something went wrong. Check your connection and try again.';
    }
}

function StatusBadge({ status }) {
    const style = STATUS_STYLE[status];
    if (!status || !style) return <span className="text-muted-foreground">—</span>;
    const { Icon, className } = style;

    return (
        <Badge variant="outline" className={`gap-1.5 whitespace-nowrap ${className}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {STATUS_LABEL[status]}
        </Badge>
    );
}

// Kolom Action: tombol aktif hanya saat To Send / Reminder Due. Keterangan tombol disabled
// selalu terlihat, bukan hanya tooltip (FR-029).
function FuasAction({ order, isBusy, onSend }) {
    const { status, can_send: canSend, window_end_at: windowEndAt } = order.fuas;

    if (status === 'feedback_received') {
        return <span className="text-muted-foreground">—</span>;
    }

    const hasPhone = Boolean(toWaDigits(order.vehicle?.customer?.phone));
    let note = null;
    if (!canSend) {
        if (status === 'sent_1') note = `Next reminder available ${formatDateTime(windowEndAt)}`;
        else if (status === 'sent_2') note = 'Waiting for customer';
        else if (status === 'no_feedback') note = 'Feedback link closed';
    } else if (!hasPhone) {
        note = 'Customer has no phone number';
    }

    const noteId = `fuas-note-${order.id}`;

    return (
        <div className="flex flex-col items-start gap-1">
            <Button
                type="button"
                size="sm"
                variant={canSend ? 'default' : 'outline'}
                disabled={!canSend || !hasPhone || isBusy}
                aria-describedby={note ? noteId : undefined}
                onClick={() => onSend(order)}
            >
                <Send aria-hidden="true" />
                {isBusy ? 'Preparing...' : 'Send via WhatsApp'}
            </Button>
            {note && (
                <span id={noteId} className="text-xs text-muted-foreground">
                    {note}
                </span>
            )}
        </div>
    );
}

// RULE-011: kolom dengan closure state dibungkus useMemo; actions tidak bisa disort/disembunyikan.
function buildColumns({ busyId, onSend }) {
    return [
        {
            accessorKey: 'status_changed_at',
            header: 'Completed At',
            meta: { label: 'Completed At' },
            cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.status_changed_at)}</span>,
        },
        {
            accessorKey: 'work_order_number',
            header: 'WO Number',
            meta: { label: 'WO Number' },
            cell: ({ row }) => <span className="font-medium">{row.original.work_order_number}</span>,
        },
        {
            id: 'customer',
            header: 'Customer',
            meta: { label: 'Customer' },
            enableSorting: false,
            accessorFn: (row) => row.vehicle?.customer?.name ?? '',
            cell: ({ row }) => <span className="font-medium">{row.original.vehicle?.customer?.name ?? '—'}</span>,
        },
        {
            id: 'vehicle',
            header: 'Vehicle',
            meta: { label: 'Vehicle' },
            enableSorting: false,
            accessorFn: (row) =>
                row.vehicle ? `${row.vehicle.brand} ${row.vehicle.model} ${row.vehicle.plate_number}` : '',
            cell: ({ row }) => {
                const v = row.original.vehicle;
                return v ? `${v.brand} ${v.model} · ${v.plate_number}` : '—';
            },
        },
        {
            id: 'service_advisor',
            header: 'Service Advisor',
            meta: { label: 'Service Advisor' },
            accessorFn: (row) => row.service_advisor?.name ?? '',
            cell: ({ row }) => row.original.service_advisor?.name ?? '—',
        },
        {
            id: 'fuas_status',
            header: 'FUAS Status',
            meta: { label: 'FUAS Status' },
            accessorFn: (row) => row.fuas.status ?? '',
            cell: ({ row }) => <StatusBadge status={row.original.fuas.status} />,
        },
        {
            id: 'actions',
            header: 'Action',
            meta: { label: 'Action' },
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
                <FuasAction order={row.original} isBusy={busyId === row.original.id} onSend={onSend} />
            ),
        },
    ];
}

function FuasIndex({ orders, scope, search, filters, statusOptions, serviceAdvisors }) {
    const currentScope = scope === 'completed' ? 'completed' : 'in_process';
    const pageTitle = GROUP_TITLE[currentScope];
    const indexRoute = currentScope === 'completed' ? 'admin.fuas.completed' : 'admin.fuas.in-process';
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    const [searchTerm, setSearchTerm] = useState(search ?? '');
    const [activeFilters, setActiveFilters] = useState(() => ({
        status: filters?.status ?? '',
        service_advisor_id: filters?.service_advisor_id ?? '',
    }));
    const [sorting, setSorting] = useState(() =>
        filters?.sort_by ? [{ id: filters.sort_by, desc: filters.sort_dir === 'desc' }] : []
    );
    const [isLoading, setIsLoading] = useState(false);

    // Alur kirim: busyId = baris yang sedang memanggil prepare; pending = modal "Did you send the message?".
    const [busyId, setBusyId] = useState(null);
    const [pending, setPending] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const handleSend = async (order) => {
        if (busyId !== null) return;

        const customer = order.vehicle?.customer;
        const digits = toWaDigits(customer?.phone);
        if (!digits) {
            toast.error('This customer has no phone number.');
            return;
        }

        setBusyId(order.id);
        // Jendela dibuka sinkron di dalam klik supaya tidak diblokir popup blocker; diarahkan ke WhatsApp setelah prepare.
        const popup = window.open('', '_blank');

        try {
            const { data } = await window.axios.post(route('admin.service-orders.fuas.prepare', order.id));
            const v = order.vehicle;
            const message = buildMessage({
                messageNumber: order.fuas.sent_count + 1,
                customerName: customer.name,
                vehicleLabel: v ? `${v.brand} ${v.model} (${v.plate_number})` : 'kendaraan',
                link: data.url,
            });
            const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

            if (popup) popup.location.href = waUrl;
            setPending({ order, waUrl, popupBlocked: !popup });
        } catch (error) {
            if (popup) popup.close();
            const status = error.response?.status;
            toast.error(errorMessageFor(status, error.response?.data?.message));
            // 409 = status berubah di server (mis. sudah dikirim): muat ulang daftar.
            if (status === 409) router.reload({ preserveScroll: true });
        } finally {
            setBusyId(null);
        }
    };

    // Hanya "Yes" menambah hitungan; "No", Esc, atau menutup modal tidak mengubah apa pun (FR-029).
    const handleConfirm = (event) => {
        event.preventDefault();
        if (confirming || !pending) return;

        setConfirming(true);
        router.post(route('admin.service-orders.fuas.confirm-sent', pending.order.id), {}, {
            preserveScroll: true,
            onSuccess: (page) => {
                if (page.props.flash?.error) {
                    toast.error(page.props.flash.error);
                } else {
                    toast.success(page.props.flash?.success ?? 'Message recorded as sent.');
                }
            },
            onError: () => toast.error('Could not record the message. Please try again.'),
            onFinish: () => {
                setConfirming(false);
                setPending(null);
            },
        });
    };

    const columns = useMemo(() => buildColumns({ busyId, onSend: handleSend }), [busyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const table = useDataTable({
        data: orders.data,
        columns,
        manualSorting: true,
        sorting,
        onSortingChange: setSorting,
    });

    useEffect(() => {
        const removeStart = router.on('start', () => setIsLoading(true));
        const removeFinish = router.on('finish', () => setIsLoading(false));
        // abort() menghasilkan halaman HTML, bukan error validasi (RULE-041); kegagalan jaringan (RULE-042).
        const removeInvalid = router.on('invalid', (event) => {
            const status = event.detail.response?.status;
            if (![403, 409, 413, 419, 422, 429].includes(status)) return;
            event.preventDefault();
            toast.error(errorMessageFor(status));
        });
        const removeException = router.on('exception', (event) => {
            event.preventDefault();
            toast.error(errorMessageFor(undefined));
        });

        return () => {
            removeStart();
            removeFinish();
            removeInvalid();
            removeException();
        };
    }, []);

    // RULE-023: search + filter + sort dalam satu efek, debounce, lewati render pertama.
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            const activeSort = sorting[0];

            router.get(route(indexRoute), {
                search: searchTerm || undefined,
                status: activeFilters.status || undefined,
                // RULE-025: parameter filter ikut dikirim ulang di setiap request.
                service_advisor_id: activeFilters.service_advisor_id || undefined,
                sort_by: activeSort?.id || undefined,
                sort_dir: activeSort ? (activeSort.desc ? 'desc' : 'asc') : undefined,
            }, {
                preserveState: true,
                replace: true,
            });
        }, 400);

        return () => clearTimeout(timeout);
    }, [searchTerm, activeFilters, sorting]); // eslint-disable-line react-hooks/exhaustive-deps

    const filterDefs = useMemo(() => [
        {
            key: 'status',
            label: 'FUAS Status',
            type: 'select',
            options: statusOptions.map((value) => ({ value, label: STATUS_LABEL[value] })),
        },
        ...(isAdmin ? [{
            key: 'service_advisor_id',
            label: 'Service Advisor',
            type: 'select',
            options: serviceAdvisors.map((sa) => ({ value: String(sa.id), label: sa.name })),
        }] : []),
    ], [statusOptions, serviceAdvisors, isAdmin]);

    const handleFilterChange = (key, value) => {
        setActiveFilters((current) => ({ ...current, [key]: value }));
    };

    const handleFilterClear = () => {
        setActiveFilters({ status: '', service_advisor_id: '' });
    };

    const messageNumber = pending ? pending.order.fuas.sent_count + 1 : 1;

    return (
        <AdminLayout title={pageTitle}>
            <Head title={pageTitle} />
            <p className="mb-3 text-sm text-muted-foreground">
                {currentScope === 'in_process'
                    ? 'Completed orders appear here 4 days after completion. Send the feedback form to the customer via WhatsApp (up to 2 messages).'
                    : 'Orders where the customer sent feedback, or where no feedback came after the 2nd message.'}
            </p>
            <DataTable
                table={table}
                links={orders.links}
                emptyMessage={currentScope === 'in_process' ? 'No orders need follow-up yet.' : 'No completed follow-ups yet.'}
                isLoading={isLoading}
                isFiltered={Boolean(searchTerm || activeFilters.status || activeFilters.service_advisor_id)}
                paginationMeta={{ from: orders.from, to: orders.to, total: orders.total }}
                onRowClick={(order) => router.visit(route('admin.service-orders.show', order.id))}
                searchSlot={
                    <DataTableSearchInput
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search customer, WO number, plate number..."
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
            />

            <AlertDialog
                open={pending !== null}
                onOpenChange={(open) => {
                    // Menutup modal = No. Tidak boleh menutup di tengah pengiriman konfirmasi.
                    if (!open && !confirming) setPending(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Did you send the message?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will count as message {messageNumber} of {MAX_SENT}.
                            {pending?.order?.vehicle?.customer?.name && (
                                <>
                                    {' '}Customer: <span className="font-medium text-foreground">{pending.order.vehicle.customer.name}</span>.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {pending?.popupBlocked && (
                        <p className="text-sm text-amber-700">
                            Your browser blocked WhatsApp from opening.{' '}
                            <a
                                href={pending.waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-[36px] items-center font-medium underline"
                            >
                                Open WhatsApp
                            </a>
                            , send the message, then answer here.
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={confirming}>No</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirm} disabled={confirming}>
                            {confirming ? 'Saving...' : 'Yes'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}

// Dua route memakai komponen yang sama; key per scope mereset state (pencarian, filter, sort)
// saat pindah antara FUAS In Process dan FUAS Completed lewat sidebar.
export default function Index(props) {
    return <FuasIndex key={props.scope} {...props} />;
}
