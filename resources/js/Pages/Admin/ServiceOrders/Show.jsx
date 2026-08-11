import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, router, usePage, Link, Head } from '@inertiajs/react';
import { toast } from 'sonner';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/Components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Separator } from '@/Components/ui/separator';
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    RotateCcw,
    ChevronDown,
    Copy,
    Check,
    FileText,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

// Inertia menganggap back()->with('error', ...) sebagai response SUKSES
// (302 redirect biasa, bukan 422 validation error) — jadi onSuccess HARUS
// cek flash.error dulu sebelum nampilin toast sukses. onError cuma
// ke-trigger untuk ValidationException (422).
function flashToast(page, successMessage) {
    const flash = page.props.flash;
    if (flash?.error) {
        toast.error(flash.error);
        return false;
    }
    toast.success(successMessage);
    return true;
}

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

const BANK_ACCOUNTS = [
    { bank: 'Bank Mandiri IDR', account: 'PT Wahana Wirawan — No. A/C 1240012993409' },
    { bank: 'Bank Central Asia IDR', account: 'PT Wahana Wirawan — No. A/C 7160263789' },
];
const CASHIER_WA_GROUP_URL =
    'https://chat.whatsapp.com/Jqsdzukbkjk1hXMzAzXR1Q?s=sh&p=i&ilr=2&amv=2';

export default function Show({
    order,
    settings,
    maxInvoices,
    breakdownByGroup,
    customerComplaintEditable,
}) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    // --- Generic confirm dialog (satu state untuk semua aksi destruktif/berisiko) ---
    // Menggantikan seluruh window.confirm() sebelumnya, konsisten dengan pola
    // AlertDialog resmi shadcn yang sudah dipakai di Vehicles/Customers/Users.
    const [confirmDialog, setConfirmDialog] = useState(null);
    // shape: { title, description, confirmLabel, destructive, onConfirm }

    const closeConfirmDialog = () => setConfirmDialog(null);

    // Group mana yang lagi dipilih file-nya di form upload estimation form.
    const [selectedGroup, setSelectedGroup] = useState(null);

    // State untuk add/edit item — addingToGroup menandai card group mana yang
    // lagi buka form "tambah item"; editingItemId menandai item mana yang
    // lagi dalam mode edit.
    const [addingToGroup, setAddingToGroup] = useState(null);
    const [editingItemId, setEditingItemId] = useState(null);

    // Group mana yang sedang collapsed — default semua terbuka.
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const toggleGroup = (group) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
        });
    };

    const { setData, patch, processing } = useForm({ status: '' });
    const invoiceForm = useForm({ invoice_pdf: null });
    const estimationForm = useForm({ group: '', pdf: null });
    const addItemForm = useForm({ ...EMPTY_ITEM_FORM });
    const editItemForm = useForm({ ...EMPTY_ITEM_FORM });
    const paymentDetailsForm = useForm({
        invoice_number: order.invoice_number ?? '',
        bill_to: order.bill_to ?? '',
    });
    const staffReceiptForm = useForm({ receipt: null });

    // Form khusus customer complaint — kolom cuma editable saat
    // appointment/work_in_progress (guard sumber kebenaran tetap di backend,
    // lihat ServiceOrder::isCustomerComplaintEditable(), dikirim controller
    // lewat prop `customerComplaintEditable`).
    const complaintForm = useForm({ customer_complaint: order.customer_complaint ?? '' });

    const availableTransitions = ALLOWED_TRANSITIONS[order.status] ?? [];
    const revertTarget = REVERT_TRANSITIONS[order.status] ?? null;

    const invoice = order.invoice;
    const hasInvoice = !!invoice;

    // Invoice PDF section disembunyikan selama work_in_progress (dan appointment/
    // quality_control), baru muncul mulai invoice_preparation — permintaan owner.
    const showInvoiceSection = ['invoice_preparation', 'completed'].includes(order.status);
    const showPaymentSection = ['invoice_preparation', 'completed'].includes(order.status);
    const canEditPayment = order.status === 'invoice_preparation';

    const docsByGroup = estimationDocsByGroup(order.estimation_documents);
    const vatPercent = Number(settings?.ppn_percent ?? 0);
    const canEditEstimationDocs = order.status === 'work_in_progress';
    const canEditItems = order.status === 'work_in_progress';

    // --- Status change ---

    const handleSelectStatus = (value) => {
        setData('status', value);
        setConfirmDialog({
            title: 'Confirm Status Change',
            description: (
                <>
                    Change order status from <strong>{STATUS_LABEL[order.status]}</strong> to{' '}
                    <strong>{STATUS_LABEL[value]}</strong>? This action will be recorded and
                    cannot be easily undone.
                </>
            ),
            confirmLabel: 'Confirm',
            destructive: false,
            onConfirm: () => {
                patch(route('admin.service-orders.update-status', order.id), {
                    preserveScroll: true,
                    onSuccess: (page) => flashToast(page, `Status updated to ${STATUS_LABEL[value]}`),
                    onError: () => toast.error('Failed to update status'),
                    onFinish: closeConfirmDialog,
                });
            },
        });
    };

    const handleRevertStatus = () => {
        setConfirmDialog({
            title: 'Confirm Revert Status',
            description: (
                <>
                    Revert order status from <strong>{STATUS_LABEL[order.status]}</strong> back
                    to <strong>{STATUS_LABEL[revertTarget]}</strong>? Use this only if items need
                    to be reopened for negotiation.
                </>
            ),
            confirmLabel: 'Confirm Revert',
            destructive: true,
            onConfirm: () => {
                router.patch(
                    route('admin.service-orders.revert-status', order.id),
                    {},
                    {
                        preserveScroll: true,
                        onSuccess: (page) => flashToast(page, `Status reverted to ${STATUS_LABEL[revertTarget]}`),
                        onError: () => toast.error('Failed to revert status'),
                        onFinish: closeConfirmDialog,
                    }
                );
            },
        });
    };

    // --- Customer complaint ---

    const handleComplaintSubmit = (e) => {
        e.preventDefault();
        complaintForm.patch(route('admin.service-orders.update-customer-complaint', order.id), {
            preserveScroll: true,
            onSuccess: (page) => flashToast(page, 'Customer complaint saved'),
            onError: () => toast.error('Failed to save customer complaint'),
        });
    };

    // --- Delete service order (admin only, hard delete, permanen) ---

    const handleDeleteOrder = () => {
        setConfirmDialog({
            title: 'Delete this service order?',
            description: (
                <>
                    This will permanently delete WO{' '}
                    <strong>{order.work_order_number}</strong> and all its related data
                    (inspection items, videos, estimation documents, invoice, payment
                    receipts). This action cannot be undone.
                </>
            ),
            confirmLabel: 'Delete Permanently',
            destructive: true,
            onConfirm: () => {
                // Sengaja TANPA preserveScroll — setelah sukses, backend
                // redirect ke admin.service-orders.index (bukan back()), jadi
                // memang mau full navigasi keluar dari halaman ini.
                router.delete(route('admin.service-orders.destroy', order.id), {
                    onSuccess: (page) => flashToast(page, 'Service order permanently deleted'),
                    onError: () => toast.error('Failed to delete service order'),
                    onFinish: closeConfirmDialog,
                });
            },
        });
    };

    // --- Invoice PDF ---

    const handleInvoiceFileChange = (e) => {
        invoiceForm.setData('invoice_pdf', e.target.files[0]);
    };

    const handleInvoiceUpload = (e) => {
        e.preventDefault();
        invoiceForm.post(route('admin.service-orders.upload-invoice', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Invoice uploaded');
                if (ok) invoiceForm.reset();
            },
            onError: () => toast.error('Failed to upload invoice'),
        });
    };

    const handleDeleteInvoice = () => {
        setConfirmDialog({
            title: 'Delete Invoice PDF',
            description: 'This invoice PDF will be permanently removed. This action cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
                router.delete(route('admin.service-orders.delete-invoice', order.id), {
                    preserveScroll: true,
                    onSuccess: (page) => flashToast(page, 'Invoice deleted'),
                    onError: () => toast.error('Failed to delete invoice'),
                    onFinish: closeConfirmDialog,
                });
            },
        });
    };

    // --- Estimation documents ---

    const handleEstimationFileChange = (group, file) => {
        setSelectedGroup(group);
        estimationForm.setData({ group, pdf: file });
    };

    const handleEstimationUpload = (e) => {
        e.preventDefault();
        estimationForm.post(route('admin.service-orders.upload-estimation-document', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Estimation form uploaded');
                if (ok) {
                    estimationForm.reset();
                    setSelectedGroup(null);
                }
            },
            onError: () => toast.error('Failed to upload estimation form'),
        });
    };

    const handleDeleteEstimationDoc = (doc) => {
        setConfirmDialog({
            title: 'Delete Estimation Form',
            description: `The estimation form for the ${GROUP_LABEL[doc.group]} group will be permanently removed.`,
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
                router.delete(
                    route('admin.service-orders.delete-estimation-document', [order.id, doc.id]),
                    {
                        preserveScroll: true,
                        onSuccess: (page) => flashToast(page, 'Estimation form deleted'),
                        onError: () => toast.error('Failed to delete estimation form'),
                        onFinish: closeConfirmDialog,
                    }
                );
            },
        });
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
            onSuccess: (page) => {
                const ok = flashToast(page, 'Item added');
                if (ok) closeAddItemForm();
            },
            onError: () => toast.error('Failed to add item — check the form for errors'),
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
                onSuccess: (page) => {
                    const ok = flashToast(page, 'Item updated');
                    if (ok) closeEditItemForm();
                },
                onError: () => toast.error('Failed to update item — check the form for errors'),
            }
        );
    };

    const handleDeleteItem = (item) => {
        setConfirmDialog({
            title: 'Delete Item',
            description: `"${item.name}" will be permanently removed from this order.`,
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
                router.delete(
                    route('admin.service-orders.inspection-items.destroy', [order.id, item.id]),
                    {
                        preserveScroll: true,
                        onSuccess: (page) => flashToast(page, 'Item deleted'),
                        onError: () => toast.error('Failed to delete item'),
                        onFinish: closeConfirmDialog,
                    }
                );
            },
        });
    };

    const handleReopenItem = (item) => {
        setConfirmDialog({
            title: 'Reopen Item',
            description: `"${item.name}" will be reopened for negotiation. The customer will be able to review it again.`,
            confirmLabel: 'Reopen',
            destructive: false,
            onConfirm: () => {
                router.post(
                    route('admin.service-orders.inspection-items.reopen', [order.id, item.id]),
                    {},
                    {
                        preserveScroll: true,
                        onSuccess: (page) => flashToast(page, 'Item reopened'),
                        onError: () => toast.error('Failed to reopen item'),
                        onFinish: closeConfirmDialog,
                    }
                );
            },
        });
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

    const hasReceipt = !!(order.customer_payment_receipt || order.staff_payment_receipt);
    const hasPaymentDetails = !!(order.invoice_number && order.bill_to);
    const canReportToCashier = hasReceipt && hasPaymentDetails;

    const handlePaymentDetailsSubmit = (e) => {
        e.preventDefault();
        paymentDetailsForm.patch(route('admin.service-orders.update-payment-details', order.id), {
            preserveScroll: true,
            onSuccess: (page) => flashToast(page, 'Payment details saved'),
            onError: () => toast.error('Failed to save payment details'),
        });
    };

    const handleStaffReceiptChange = (e) => {
        staffReceiptForm.setData('receipt', e.target.files[0]);
    };

    const handleStaffReceiptUpload = (e) => {
        e.preventDefault();
        staffReceiptForm.post(route('admin.service-orders.upload-staff-payment-receipt', order.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Receipt uploaded');
                if (ok) staffReceiptForm.reset();
            },
            onError: () => toast.error('Failed to upload receipt'),
        });
    };

    const handleDeleteStaffReceipt = () => {
        setConfirmDialog({
            title: 'Delete Receipt',
            description: 'This staff receipt will be permanently removed.',
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
                router.delete(route('admin.service-orders.delete-staff-payment-receipt', order.id), {
                    preserveScroll: true,
                    onSuccess: (page) => flashToast(page, 'Receipt deleted'),
                    onError: () => toast.error('Failed to delete receipt'),
                    onFinish: closeConfirmDialog,
                });
            },
        });
    };

    const [copied, setCopied] = useState(false);

    // Teks polos untuk clipboard (tidak perlu encodeURIComponent lagi karena
    // bukan untuk URL query, cuma untuk clipboard).
    const cashierMessageText =
        `Konfirmasi pembayaran WO: ${order.work_order_number ?? '-'}\n` +
        `Invoice: ${order.invoice_number ?? '-'}\n` +
        `Bill To: ${order.bill_to ?? '-'}\n` +
        `Mohon dicek, terima kasih.`;

    const handleCopyMessage = async () => {
        try {
            await navigator.clipboard.writeText(cashierMessageText);
            setCopied(true);
            toast.success('Message copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy — please copy the text manually');
        }
    };

    // --- Copy report link + message untuk dikirim manual ke WA customer ---
    // Muncul begitu order sudah lewat appointment (mulai work_in_progress) —
    // sebelum itu belum ada apa-apa yang relevan untuk dilihat customer.
    // Hilang kalau order sudah masuk cabang all_rejected_cancelled.
    const [reportLinkCopied, setReportLinkCopied] = useState(false);

    const canShareReportLink =
        order.status !== 'appointment' && order.status !== 'all_rejected_cancelled';

    const reportUrl = order.inspection_token
        ? route('public.inspection-report', order.inspection_token)
        : null;

    // Sapaan Pagi/Siang/Sore diambil dari rentang jam WIB (Asia/Jakarta)
    // saat tombol copy diklik — bukan dari jam server, supaya benar walau
    // server pakai timezone lain.
    function getGreeting() {
        const hour = Number(
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Jakarta',
                hour: 'numeric',
                hour12: false,
            }).format(new Date())
        );

        if (hour >= 4 && hour < 11) return 'Pagi';
        if (hour >= 11 && hour < 15) return 'Siang';
        return 'Sore';
    }

    // "Kendaraan customer" diambil dari service order yang terdaftar
    // (brand + model + plate number kendaraan di order ini).
    const vehicleLabel = order.vehicle
        ? [order.vehicle.brand, order.vehicle.model, order.vehicle.plate_number]
              .filter(Boolean)
              .join(' ')
        : '-';

    const reportMessageText =
        `Selamat ${getGreeting()} Bapak/Ibu Pelanggan VW PIK, berikut kami kirimkan link laporan hasil inspeksi dan estimasi kendaraan Anda (${vehicleLabel}):\n` +
        `${reportUrl ?? '-'}\n` +
        `Di dalamnya ada video hasil pengecekan dari teknisi kami dan rincian biaya perbaikan. Mohon dapat di cek dan saya tunggu persetujuan dari bapak/ibu selanjutnya. Terima kasih.`;

    const handleCopyReportLink = async () => {
        try {
            await navigator.clipboard.writeText(reportMessageText);
            setReportLinkCopied(true);
            toast.success('Report link & message copied to clipboard');
            setTimeout(() => setReportLinkCopied(false), 2000);
        } catch {
            toast.error('Failed to copy — please copy the text manually');
        }
    };

    return (
        <AdminLayout title={`Service Order #${order.work_order_number ?? order.id}`}>
            <Head title={`Service Order #${order.work_order_number ?? order.id}`} />
            {/* Header — back link + judul + status, dipisah dari Card supaya
                konsisten dengan pola headerActions AdminLayout di halaman lain */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href={route('admin.service-orders.index')}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-vw-grey/30 text-vw-grey hover:bg-vw-grey-light"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">
                            {order.work_order_number ?? `Order #${order.id}`}
                        </h1>
                        <p className="text-sm text-vw-grey">
                            {order.vehicle?.customer?.name ?? '—'} ·{' '}
                            {order.vehicle?.plate_number ?? '—'}
                        </p>
                    </div>
                </div>
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
                    {/* Delete order — admin-only, ditaruh di header supaya bisa
                        diakses langsung dari halaman detail tanpa balik ke
                        Index (keperluan debugging setelah live di hosting). */}
                    {isAdmin && (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteOrder}
                        >
                            <Trash2 className="mr-1 h-4 w-4" /> Delete Order
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Kolom kiri: info utama */}
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Order Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
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
                                        ? `${order.vehicle.brand} ${order.vehicle.model}`
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

                    {/* Customer Complaint — editable saat appointment & work_in_progress
                        saja (guard sumber kebenaran di backend, lihat
                        ServiceOrder::isCustomerComplaintEditable()). Begitu order masuk
                        quality_control dst, field dikunci jadi tampilan read-only. */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Complaint</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {customerComplaintEditable ? (
                                <form onSubmit={handleComplaintSubmit} className="space-y-2">
                                    <Textarea
                                        value={complaintForm.data.customer_complaint}
                                        onChange={(e) =>
                                            complaintForm.setData(
                                                'customer_complaint',
                                                e.target.value
                                            )
                                        }
                                        placeholder="What did the customer report/complain about their vehicle?"
                                        rows={3}
                                    />
                                    {complaintForm.errors.customer_complaint && (
                                        <p className="text-sm text-urgent">
                                            {complaintForm.errors.customer_complaint}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-vw-grey">
                                            Editable until the order reaches Quality Control.
                                        </p>
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={complaintForm.processing}
                                        >
                                            {complaintForm.processing ? 'Saving...' : 'Save'}
                                        </Button>
                                    </div>
                                </form>
                            ) : (
                                <p className="text-sm text-gray-900">
                                    {order.customer_complaint || (
                                        <span className="text-vw-grey">
                                            No complaint recorded.
                                        </span>
                                    )}
                                </p>
                            )}
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
                                        value={
                                            addingToGroup && missingGroups.includes(addingToGroup)
                                                ? addingToGroup
                                                : ''
                                        }
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
                        Inspection Items — 1 Collapsible per group, urut tetap sesuai
                        GROUPS, HANYA muncul kalau group itu punya minimal 1 item (atau
                        sedang dalam proses menambah item pertama). Header collapsed
                        tetap menampilkan jumlah item + group total supaya order dengan
                        banyak group tidak jadi scroll panjang untuk sekadar cek angka.
                    */}
                    {GROUPS.map((group) => {
                        const groupItems = (order.inspection_items ?? []).filter(
                            (item) => item.group === group
                        );

                        if (groupItems.length === 0 && addingToGroup !== group) return null;

                        const breakdown =
                            breakdownByGroup?.[group] ?? { subtotal: 0, vat_amount: 0, grand_total: 0 };
                        const doc = docsByGroup[group];
                        const hasFile = doc?.pdf_path;
                        const isOpen = !collapsedGroups.has(group);

                        return (
                            <Card key={group}>
                                <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group)}>
                                    <CardHeader className="flex flex-row items-center justify-between py-4">
                                        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                                            <ChevronDown
                                                className={cn(
                                                    'h-4 w-4 shrink-0 text-vw-grey transition-transform',
                                                    !isOpen && '-rotate-90'
                                                )}
                                            />
                                            <CardTitle className="text-base">
                                                {GROUP_LABEL[group]}
                                            </CardTitle>
                                            <Badge variant="secondary">{groupItems.length}</Badge>
                                            <span className="ml-auto pr-3 text-sm font-medium text-vw-grey">
                                                {formatCurrency(breakdown.grand_total)}
                                            </span>
                                        </CollapsibleTrigger>
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

                                    <CollapsibleContent>
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
                                                                addItemForm.setData(
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
                                                                value={addItemForm.data.cost_labour}
                                                                onChange={(e) =>
                                                                    addItemForm.setData(
                                                                        'cost_labour',
                                                                        e.target.value
                                                                    )
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
                                                                    addItemForm.setData(
                                                                        'cost_item',
                                                                        e.target.value
                                                                    )
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
                                                        <Button
                                                            type="submit"
                                                            size="sm"
                                                            disabled={addItemForm.processing}
                                                        >
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
                                                                onSubmit={(e) =>
                                                                    handleEditItemSubmit(e, item.id)
                                                                }
                                                                className="space-y-3 rounded-md border border-vw-blue/30 bg-vw-blue/5 p-4"
                                                            >
                                                                <div className="space-y-1.5">
                                                                    <Label>Item Name</Label>
                                                                    <Input
                                                                        value={editItemForm.data.name}
                                                                        onChange={(e) =>
                                                                            editItemForm.setData(
                                                                                'name',
                                                                                e.target.value
                                                                            )
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
                                                                                editItemForm.data
                                                                                    .discount_labour_percent
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
                                                                            value={
                                                                                editItemForm.data
                                                                                    .discount_item_percent
                                                                            }
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
                                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                    <div className="min-w-0">
                                                                        <div className="font-medium text-gray-900">
                                                                            {item.name}
                                                                        </div>
                                                                        {item.description && (
                                                                            <p className="text-sm text-vw-grey">
                                                                                {item.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end sm:text-right">
                                                                        <p className="font-medium text-gray-900">
                                                                            {formatCurrency(itemDisplayTotal(item))}
                                                                        </p>
                                                                        <Badge
                                                                            variant={
                                                                                ITEM_STATUS_VARIANT[item.status] ??
                                                                                'secondary'
                                                                            }
                                                                        >
                                                                            {ITEM_STATUS_LABEL[item.status] ??
                                                                                item.status}
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
                                                                                ? formatCurrency(
                                                                                      item.final_price_snapshot
                                                                                  )
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

                                                                {canEditItems && (
                                                                    <div className="flex items-center gap-3 pt-1">
                                                                        {item.status !== 'approved' && (
                                                                            <>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        openEditItemForm(item)
                                                                                    }
                                                                                    className="flex items-center gap-1 text-xs font-medium text-vw-light-blue hover:underline"
                                                                                >
                                                                                    <Pencil className="h-3 w-3" /> Edit
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleDeleteItem(item)
                                                                                    }
                                                                                    className="flex items-center gap-1 text-xs font-medium text-urgent hover:underline"
                                                                                >
                                                                                    <Trash2 className="h-3 w-3" />{' '}
                                                                                    Delete
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        {item.status === 'rejected' && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleReopenItem(item)}
                                                                                className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline"
                                                                            >
                                                                                <RotateCcw className="h-3 w-3" />{' '}
                                                                                Reopen
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
                                                        <p className="text-gray-900">
                                                            {formatCurrency(breakdown.subtotal)}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <p className="text-vw-grey">VAT ({vatPercent}%)</p>
                                                        <p className="text-gray-900">
                                                            {formatCurrency(breakdown.vat_amount)}
                                                        </p>
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
                                                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                        <FileText className="h-4 w-4 text-vw-grey" />
                                                        Estimation Form
                                                    </p>

                                                    {!canEditEstimationDocs && (
                                                        <p className="text-xs text-vw-grey">
                                                            Estimation forms can only be uploaded or changed
                                                            while the order is at Work In Progress.
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
                                                                    {doc.uploaded_by?.name &&
                                                                        ` by ${doc.uploaded_by.name}`}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        canEditEstimationDocs && (
                                                            <p className="text-sm text-vw-grey">
                                                                No file uploaded yet.
                                                            </p>
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
                                                            {hasFile && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-urgent hover:text-urgent/80"
                                                                    onClick={() =>
                                                                        handleDeleteEstimationDoc(doc)
                                                                    }
                                                                >
                                                                    Delete
                                                                </Button>
                                                            )}
                                                        </form>
                                                    )}
                                                    {selectedGroup === group && estimationForm.errors.pdf && (
                                                        <p className="mt-1 text-xs text-urgent">
                                                            {estimationForm.errors.pdf}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Collapsible>
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
                                    <p className="font-semibold text-gray-900">
                                        {formatCurrency(grandTotal)}
                                    </p>
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

                {/* Kolom kanan: status control + invoice — sticky supaya tetap
                    terlihat selagi scroll daftar group item di kiri yang panjang */}
                <div className="lg:col-span-1">
                    <div className="lg:sticky lg:top-6 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Update Status Progress</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => window.location.reload()}
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh Page
                                </Button>

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
                                            <p className="text-xs text-urgent">
                                                Upload minimal 1 invoice PDF dulu sebelum bisa menandai
                                                order completed.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-sm text-vw-grey">
                                        This order is at a final status (
                                        {STATUS_LABEL[order.status]}) — no further manual
                                        transition available.
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
                                            onClick={handleRevertStatus}
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

                        {/* Report Link — copy link + pesan siap kirim jadi 1 klik, SA
                            tinggal paste manual ke WhatsApp customer. Muncul mulai
                            work_in_progress (belum relevan saat masih appointment),
                            hilang kalau order sudah all_rejected_cancelled. */}
                        {canShareReportLink && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Report Link</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="text-xs text-vw-grey">
                                        Copies a ready-to-send WhatsApp message with the
                                        customer's report link. Paste it manually into their
                                        WhatsApp chat.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={handleCopyReportLink}
                                        disabled={!reportUrl}
                                    >
                                        {reportLinkCopied ? (
                                            <>
                                                <Check className="mr-1 h-4 w-4" /> Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="mr-1 h-4 w-4" /> Copy Link & Message
                                            </>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Invoice PDF section — disembunyikan selama work_in_progress
                            (dan sebelumnya), baru muncul mulai invoice_preparation. */}
                        {showInvoiceSection && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Invoice PDF</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {hasInvoice ? (
                                        <div className="flex items-center justify-between gap-2 rounded border border-vw-grey/10 p-2">
                                            <div className="space-y-0.5">
                                                <a
                                                    href={`/storage/${invoice.file_path}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 underline"
                                                >
                                                    View Invoice
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
                                                    className="text-urgent hover:text-urgent/80"
                                                    onClick={handleDeleteInvoice}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-vw-grey">No invoice uploaded yet.</p>
                                    )}

                                    {order.status !== 'completed' && (
                                        <form onSubmit={handleInvoiceUpload} className="space-y-2">
                                            <Label htmlFor="invoice_pdf">
                                                {hasInvoice ? 'Replace invoice PDF' : 'Upload invoice PDF'}
                                            </Label>
                                            <Input
                                                id="invoice_pdf"
                                                type="file"
                                                accept="application/pdf"
                                                onChange={handleInvoiceFileChange}
                                            />
                                            {invoiceForm.errors.invoice_pdf && (
                                                <p className="text-xs text-urgent">
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
                                                {invoiceForm.processing
                                                    ? 'Uploading...'
                                                    : hasInvoice
                                                    ? 'Replace'
                                                    : 'Upload'}
                                            </Button>
                                        </form>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {showPaymentSection && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Payment</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Info rekening — statis, PT Wahana Wirawan */}
                                    <div className="space-y-1.5 rounded-md bg-vw-grey-light p-3 text-xs">
                                        {BANK_ACCOUNTS.map((acc) => (
                                            <div key={acc.bank}>
                                                <p className="font-semibold text-gray-900">{acc.bank}</p>
                                                <p className="text-vw-grey">{acc.account}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Invoice number & bill to */}
                                    {canEditPayment ? (
                                        <form onSubmit={handlePaymentDetailsSubmit} className="space-y-2">
                                            <div className="space-y-1.5">
                                                <Label>Invoice Number</Label>
                                                <Input
                                                    value={paymentDetailsForm.data.invoice_number}
                                                    onChange={(e) =>
                                                        paymentDetailsForm.setData(
                                                            'invoice_number',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Bill To</Label>
                                                <Input
                                                    value={paymentDetailsForm.data.bill_to}
                                                    onChange={(e) =>
                                                        paymentDetailsForm.setData('bill_to', e.target.value)
                                                    }
                                                />
                                            </div>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={paymentDetailsForm.processing}
                                            >
                                                {paymentDetailsForm.processing ? 'Saving...' : 'Save'}
                                            </Button>
                                        </form>
                                    ) : (
                                        <div className="space-y-1 text-sm">
                                            <p>
                                                <span className="text-vw-grey">Invoice Number:</span>{' '}
                                                {order.invoice_number ?? '—'}
                                            </p>
                                            <p>
                                                <span className="text-vw-grey">Bill To:</span>{' '}
                                                {order.bill_to ?? '—'}
                                            </p>
                                        </div>
                                    )}

                                    {/* Receipt customer (read-only, upload dari halaman publik) */}
                                    <div className="border-t border-vw-grey/10 pt-3">
                                        <p className="text-sm font-medium text-gray-900">Customer Receipt</p>
                                        {order.customer_payment_receipt ? (
                                            <a
                                                href={`/storage/${order.customer_payment_receipt.file_path}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-blue-600 underline"
                                            >
                                                View receipt
                                            </a>
                                        ) : (
                                            <p className="text-sm text-vw-grey">
                                                Not uploaded by customer yet.
                                            </p>
                                        )}
                                    </div>

                                    {/* Receipt versi SA */}
                                    <div className="border-t border-vw-grey/10 pt-3">
                                        <p className="text-sm font-medium text-gray-900">Staff Receipt</p>
                                        {order.staff_payment_receipt ? (
                                            <div className="flex items-center justify-between">
                                                <a
                                                    href={`/storage/${order.staff_payment_receipt.file_path}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-blue-600 underline"
                                                >
                                                    View receipt
                                                </a>
                                                {canEditPayment && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-urgent hover:text-urgent/80"
                                                        onClick={handleDeleteStaffReceipt}
                                                    >
                                                        Delete
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-vw-grey">No receipt uploaded yet.</p>
                                        )}
                                        {canEditPayment && (
                                            <form
                                                onSubmit={handleStaffReceiptUpload}
                                                className="mt-2 flex items-center gap-2"
                                            >
                                                <Input
                                                    type="file"
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    className="text-xs"
                                                    onChange={handleStaffReceiptChange}
                                                />
                                                <Button
                                                    type="submit"
                                                    size="sm"
                                                    disabled={
                                                        staffReceiptForm.processing ||
                                                        !staffReceiptForm.data.receipt
                                                    }
                                                >
                                                    {staffReceiptForm.processing ? 'Uploading...' : 'Upload'}
                                                </Button>
                                            </form>
                                        )}
                                    </div>

                                    {/* Report to Cashier — download receipt + copy pesan template secara
                                        terpisah, karena link grup WA (beda dari wa.me personal) tidak
                                        mendukung auto-isi teks pesan. */}
                                    {canEditPayment && (
                                        <div className="space-y-2 border-t border-vw-grey/10 pt-3">
                                            {!canReportToCashier && (
                                                <p className="text-xs text-amber-600">
                                                    Fill in Invoice Number, Bill To, and upload at least
                                                    one receipt before reporting to cashier.
                                                </p>
                                            )}

                                            {(order.customer_payment_receipt ||
                                                order.staff_payment_receipt) && (
                                                <a
                                                    href={`/storage/${
                                                        (
                                                            order.staff_payment_receipt ??
                                                            order.customer_payment_receipt
                                                        ).file_path
                                                    }`}
                                                    download
                                                    className="block w-full rounded-md border border-vw-grey px-4 py-2 text-center text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                                >
                                                    Download Receipt
                                                </a>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={handleCopyMessage}
                                                disabled={!canReportToCashier}
                                            >
                                                {copied ? (
                                                    <>
                                                        <Check className="mr-1 h-4 w-4" /> Copied!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="mr-1 h-4 w-4" /> Copy Message
                                                    </>
                                                )}
                                            </Button>
                                            {canReportToCashier ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        window.open(
                                                            CASHIER_WA_GROUP_URL,
                                                            'wa_cashier_tab'
                                                        )
                                                    }
                                                    className="block w-full rounded-md bg-vw-blue px-4 py-2 text-center text-xs font-semibold text-white hover:bg-vw-blue/90"
                                                >
                                                    Open Cashier WA Group
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled
                                                    className="block w-full cursor-not-allowed rounded-md bg-vw-grey/40 px-4 py-2 text-center text-xs font-semibold text-white"
                                                >
                                                    Open Cashier WA Group
                                                </button>
                                            )}
                                            <p className="text-xs text-vw-grey">
                                                1) Download the receipt · 2) Copy the message · 3) Open the
                                                group and paste the message + attach the receipt manually.
                                            </p>
                                        </div>
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
            </div>

            {/* Satu AlertDialog generik untuk semua aksi destruktif/berisiko di
                halaman ini (delete item/invoice/estimation doc/receipt/order,
                reopen item, ubah status, revert status) — menggantikan
                window.confirm(). */}
            <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && closeConfirmDialog()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDialog?.onConfirm}
                            className={cn(
                                confirmDialog?.destructive &&
                                    'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            )}
                        >
                            {confirmDialog?.confirmLabel ?? 'Confirm'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
}