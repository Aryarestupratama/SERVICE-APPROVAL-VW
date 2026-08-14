import { useState, useEffect } from 'react';
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/Components/ui/dialog';
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@/Components/ui/tabs';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '@/Components/ui/table';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/Components/ui/tooltip';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/Components/ui/accordion';
import { Alert, AlertTitle, AlertDescription } from '@/Components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Separator } from '@/Components/ui/separator';
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    RotateCcw,
    Copy,
    Check,
    FileText,
    RefreshCw,
    Eye,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePollLastActivity } from '@/Hooks/usePollLastActivity';

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

// Status di mana inspection item boleh di-add/edit/delete/reopen. Selaras
// dengan ServiceOrderController::ITEM_EDITABLE_STATUSES di backend — guard
// sumber kebenaran tetap di server, ini cuma dipakai untuk kontrol UI.
const ITEM_EDITABLE_STATUSES = ['appointment', 'work_in_progress'];

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

// Kontribusi 1 item ke Order Totals — item 'rejected' dikecualikan (return
// null). Item yang sudah locked (final_price_snapshot terisi) TETAP pakai
// snapshot itu sebagai total (tidak pernah berubah), tapi subtotal & VAT-nya
// dipecah balik pakai vatPercent SAAT INI (settings.ppn_percent) — ini valid
// selama tarif PPN belum pernah diganti sejak item itu di-lock. Kalau tarif
// PPN memang berubah di kemudian hari, breakdown Subtotal/VAT baris ini bisa
// sedikit meleset, TAPI Grand Total tetap akurat karena tetap pakai angka
// snapshot asli, bukan dihitung ulang dari awal.
function itemContribution(item, vatPercent) {
    if (item.status === 'rejected') return null;

    if (item.final_price_snapshot !== null && item.final_price_snapshot !== undefined) {
        const total = Number(item.final_price_snapshot);
        const sub = total / (1 + vatPercent / 100);
        return { subtotal: sub, vat: total - sub, total };
    }

    const sub = itemSubtotal(item);
    const vat = sub * (vatPercent / 100);
    return { subtotal: sub, vat, total: sub + vat };
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

// Tombol icon kecil (view/edit/delete/reopen) yang selalu dibungkus Tooltip —
// dipakai berulang di tabel item, disatukan di sini supaya konsisten &
// gayanya sama persis dengan IconActionButton di halaman Create.
function IconActionButton({ icon: Icon, label, onClick, tone = 'default' }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onClick}
                    aria-label={label}
                    className={cn(
                        'shrink-0 transition-colors',
                        tone === 'danger'
                            ? 'text-vw-grey hover:text-urgent'
                            : tone === 'warning'
                            ? 'text-vw-grey hover:text-amber-600'
                            : 'text-vw-grey hover:text-vw-light-blue'
                    )}
                >
                    <Icon className="h-4 w-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

// Input harga dengan pemisah ribuan real-time (mis. 10.000.000), sama
// seperti di Create.jsx — nilai yang dikirim ke form state tetap angka
// murni tanpa titik (string of digits), kompatibel dengan validasi
// backend 'numeric'.
function CurrencyInput({ id, value, onChange, placeholder }) {
    const formatDisplay = (val) => {
        const num = Math.round(Number(val ?? 0));
        if (!num) return '';
        return new Intl.NumberFormat('id-ID').format(num);
    };

    const [display, setDisplay] = useState(formatDisplay(value));

    useEffect(() => {
        setDisplay(formatDisplay(value));
    }, [value]);

    const handleChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '');
        setDisplay(formatDisplay(digits));
        onChange(digits);
    };

    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-vw-grey">
                Rp
            </span>
            <Input
                id={id}
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                placeholder={placeholder}
                className="pl-9"
            />
        </div>
    );
}

// Field set item — dipakai bareng oleh Dialog Add & Edit item.
function ItemFormFields({ data, errors, onChange }) {
    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label>Item Name</Label>
                <Input value={data.name} onChange={(e) => onChange('name', e.target.value)} />
                {errors.name && <p className="text-sm text-urgent">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea
                    value={data.description}
                    onChange={(e) => onChange('description', e.target.value)}
                    rows={2}
                />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Labour Price</Label>
                    <CurrencyInput
                        value={data.cost_labour}
                        onChange={(v) => onChange('cost_labour', v)}
                        placeholder="0"
                    />
                    {errors.cost_labour && (
                        <p className="text-sm text-urgent">{errors.cost_labour}</p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label>Part Price</Label>
                    <CurrencyInput
                        value={data.cost_item}
                        onChange={(v) => onChange('cost_item', v)}
                        placeholder="0"
                    />
                    {errors.cost_item && <p className="text-sm text-urgent">{errors.cost_item}</p>}
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Labour Discount (%)</Label>
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        value={data.discount_labour_percent}
                        onChange={(e) => onChange('discount_labour_percent', e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Part Discount (%)</Label>
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        value={data.discount_item_percent}
                        onChange={(e) => onChange('discount_item_percent', e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}

// Baris tabel item — 1 baris per item di dalam TabsContent tiap group.
// Nama item bisa diklik untuk buka View Dialog (read-only, tersedia untuk
// semua status termasuk approved). Actions cuma tampil sesuai status:
// Edit/Delete untuk non-approved, Reopen khusus rejected.
function ItemTableRow({ item, canEditItems, onView, onEdit, onDelete, onReopen }) {
    return (
        <TableRow>
            <TableCell>
                <button
                    type="button"
                    onClick={onView}
                    className="text-left font-medium text-gray-900 underline decoration-dotted underline-offset-2 hover:text-vw-light-blue"
                >
                    {item.name}
                </button>
            </TableCell>
            <TableCell className="text-vw-grey">
                {formatCurrency(item.cost_item)}
                {Number(item.discount_item_percent) > 0 && (
                    <span className="ml-1 text-xs">(-{item.discount_item_percent}%)</span>
                )}
            </TableCell>
            <TableCell className="text-vw-grey">
                {formatCurrency(item.cost_labour)}
                {Number(item.discount_labour_percent) > 0 && (
                    <span className="ml-1 text-xs">(-{item.discount_labour_percent}%)</span>
                )}
            </TableCell>
            <TableCell className="text-right font-semibold text-gray-900">
                {formatCurrency(itemDisplayTotal(item))}
            </TableCell>
            <TableCell>
                <Badge variant={ITEM_STATUS_VARIANT[item.status] ?? 'secondary'}>
                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                </Badge>
            </TableCell>
            <TableCell>
                <div className="flex items-center justify-end gap-3">
                    <IconActionButton icon={Eye} label="View item" onClick={onView} />
                    {canEditItems && item.status !== 'rejected' && (
                        <IconActionButton icon={Pencil} label="Edit item" onClick={onEdit} />
                    )}
                    {canEditItems && item.status === 'pending' && (
                        <IconActionButton
                            icon={Trash2}
                            label="Delete item"
                            onClick={onDelete}
                            tone="danger"
                        />
                    )}
                    {canEditItems && item.status === 'rejected' && (
                        <IconActionButton
                            icon={RotateCcw}
                            label="Reopen item"
                            onClick={onReopen}
                            tone="warning"
                        />
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function Show({
    order,
    settings,
    maxInvoices,
    breakdownByGroup,
    customerComplaintEditable,
}) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    // Polling + change-detection (PROJECT-RULES.md bagian 12) — supaya SA/admin
    // tidak perlu klik "Refresh Page" manual saat customer approve/reject item
    // dari link publik sementara halaman ini masih terbuka. Tombol "Refresh
    // Page" tetap dipertahankan sebagai fallback untuk user awam yang kurang
    // familiar teknologi (lihat card "Update Status Progress" di bawah).
    usePollLastActivity({
        url: route('admin.service-orders.last-activity', order.id),
        initialValue: order.last_activity_at,
        only: ['order', 'breakdownByGroup', 'customerComplaintEditable'],
        intervalMs: 4000,
    });

    // --- Generic confirm dialog (satu state untuk semua aksi destruktif/berisiko) ---
    // Menggantikan seluruh window.confirm() sebelumnya, konsisten dengan pola
    // AlertDialog resmi shadcn yang sudah dipakai di Vehicles/Customers/Users.
    const [confirmDialog, setConfirmDialog] = useState(null);
    // shape: { title, description, confirmLabel, destructive, onConfirm }

    const closeConfirmDialog = () => setConfirmDialog(null);

    // Group mana yang lagi dipilih file-nya di form upload estimation form.
    const [selectedGroup, setSelectedGroup] = useState(null);

    // --- Item dialogs state ---
    // addDialogGroup: group yang Dialog Add-nya sedang terbuka (null = tertutup).
    // viewingItem / editingItem: item yang sedang dilihat / diedit (null = tertutup).
    const [addDialogGroup, setAddDialogGroup] = useState(null);
    const [viewingItem, setViewingItem] = useState(null);
    const [editingItem, setEditingItem] = useState(null);

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

    // Invoice PDF section disembunyikan selama appointment/work_in_progress,
    // baru muncul mulai quality_control — permintaan owner.
    const showInvoiceSection = ['quality_control', 'invoice_preparation', 'completed'].includes(order.status);
    const showPaymentSection = ['invoice_preparation', 'completed'].includes(order.status);
    const canEditPayment = order.status === 'invoice_preparation';

    const docsByGroup = estimationDocsByGroup(order.estimation_documents);
    const vatPercent = Number(settings?.ppn_percent ?? 0);
    // Estimation form & item boleh di-add/edit/delete/reopen mulai status
    // Appointment sampai Work In Progress — sebelumnya cuma Work In Progress.
    // Dikunci begitu order masuk Quality Control (guard final tetap di backend).
    const canEditEstimationDocs = ITEM_EDITABLE_STATUSES.includes(order.status);
    const canEditItems = ITEM_EDITABLE_STATUSES.includes(order.status);

    // --- Status change ---
    // FIX (layout): Select "Move to next status" diganti tombol langsung per
    // transisi tujuan — SA langsung lihat opsi yang tersedia tanpa perlu
    // buka dropdown dulu. 1 tombol kalau cuma 1 tujuan, 2 tombol berdampingan
    // kalau ada 2 (work_in_progress -> quality_control / all_rejected_cancelled).

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
            destructive: value === 'all_rejected_cancelled',
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
    // FIX (layout): Add/Edit item sekarang lewat Dialog (bukan form inline
    // yang dulu menumpuk di dalam card group), sama persis polanya dengan
    // Create.jsx.

    const openAddItemDialog = (group) => {
        setAddDialogGroup(group);
        addItemForm.reset();
        addItemForm.clearErrors();
        addItemForm.setData({ ...EMPTY_ITEM_FORM, group });
    };

    const closeAddItemDialog = () => {
        setAddDialogGroup(null);
        addItemForm.reset();
        addItemForm.clearErrors();
    };

    const handleAddItemSubmit = () => {
        addItemForm.post(route('admin.service-orders.inspection-items.store', order.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Item added');
                if (ok) closeAddItemDialog();
            },
            onError: () => toast.error('Failed to add item — check the form for errors'),
        });
    };

    const openEditItemDialog = (item) => {
        setEditingItem(item);
        editItemForm.reset();
        editItemForm.clearErrors();
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

    const closeEditItemDialog = () => {
        setEditingItem(null);
        editItemForm.reset();
        editItemForm.clearErrors();
    };

    const handleEditItemSubmit = () => {
        editItemForm.patch(
            route('admin.service-orders.inspection-items.update', [order.id, editingItem.id]),
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const ok = flashToast(page, 'Item updated');
                    if (ok) closeEditItemDialog();
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

    // Group yang punya minimal 1 item — dipakai untuk daftar Tabs (hanya
    // group yang benar-benar punya isi yang jadi tab).
    const groupsWithItems = GROUPS.filter((group) =>
        (order.inspection_items ?? []).some((item) => item.group === group)
    );
    // Group yang belum punya item sama sekali — dipakai untuk selector
    // "Add Item to New Group", karena tab-nya belum ada sebelum item pertama
    // ditambahkan.
    const missingGroups = GROUPS.filter((group) => !groupsWithItems.includes(group));

    const [activeGroupTab, setActiveGroupTab] = useState(null);
    const currentGroupTab =
        activeGroupTab && groupsWithItems.includes(activeGroupTab)
            ? activeGroupTab
            : groupsWithItems[0];

    // --- Totals ---

    // CHANGED: sebelumnya menjumlahkan SEMUA item (termasuk rejected) dan
    // selalu recompute VAT pakai vatPercent saat ini, meskipun item itu
    // sudah 'approved' & final_price_snapshot-nya sudah locked. Sekarang:
    // - item 'rejected' dikecualikan dari Subtotal/VAT/Grand Total
    // - item locked: Grand Total tetap pakai final_price_snapshot (tidak
    //   pernah berubah), Subtotal/VAT-nya dipecah balik pakai vatPercent
    //   saat ini — valid selama tarif PPN belum pernah diganti sejak item
    //   itu di-lock (lihat catatan di itemContribution())
    // - item belum locked tetap dihitung live pakai vatPercent saat ini
    let subtotal = 0;
    let vatAmount = 0;
    let grandTotal = 0;

    for (const item of order.inspection_items ?? []) {
        const contribution = itemContribution(item, vatPercent);
        if (!contribution) continue; // item rejected, dilewati

        subtotal += contribution.subtotal;
        vatAmount += contribution.vat;
        grandTotal += contribution.total;
    }

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
    // Muncul HANYA saat order berada di status work_in_progress — begitu
    // order pindah ke quality_control (dan seterusnya sampai completed),
    // link ini tidak relevan lagi jadi disembunyikan (permintaan owner).
    const [reportLinkCopied, setReportLinkCopied] = useState(false);

    const canShareReportLink = order.status === 'work_in_progress';

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
        <TooltipProvider delayDuration={200}>
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
                                    <Select value="" onValueChange={(value) => openAddItemDialog(value)}>
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
                        Inspection Items — FIX (layout): sebelumnya 1 Collapsible
                        Card per group (5 card berulang, masing-masing menumpuk
                        form add item + tabel + breakdown + estimation form jadi
                        satu). Sekarang 1 Card + Tabs (1 tab per group yang sudah
                        punya item), isi tiap tab dipisah jelas: Table item →
                        breakdown angka → estimation form, dengan Separator di
                        antaranya. Add/Edit item pindah ke Dialog terpisah,
                        aksi per-baris pakai icon + Tooltip (bukan teks kecil).
                    */}
                    {groupsWithItems.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Inspection Items</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Tabs value={currentGroupTab} onValueChange={setActiveGroupTab}>
                                    <TabsList className="w-full justify-start overflow-x-auto">
                                        {groupsWithItems.map((group) => {
                                            const count = (order.inspection_items ?? []).filter(
                                                (item) => item.group === group
                                            ).length;
                                            return (
                                                <TabsTrigger key={group} value={group}>
                                                    {GROUP_LABEL[group]}
                                                    <Badge variant="secondary" className="ml-1.5">
                                                        {count}
                                                    </Badge>
                                                </TabsTrigger>
                                            );
                                        })}
                                    </TabsList>

                                    {groupsWithItems.map((group) => {
                                        const groupItems = (order.inspection_items ?? []).filter(
                                            (item) => item.group === group
                                        );
                                        const breakdown =
                                            breakdownByGroup?.[group] ?? {
                                                subtotal: 0,
                                                vat_amount: 0,
                                                grand_total: 0,
                                            };
                                        const doc = docsByGroup[group];
                                        const hasFile = doc?.pdf_path;

                                        return (
                                            <TabsContent key={group} value={group} className="mt-4 space-y-4">
                                                {canEditItems && (
                                                    <div className="flex justify-end">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => openAddItemDialog(group)}
                                                        >
                                                            <Plus className="mr-1 h-4 w-4" /> Add Item
                                                        </Button>
                                                    </div>
                                                )}

                                                <div className="rounded-md border border-vw-grey/20">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Item</TableHead>
                                                                <TableHead>Part</TableHead>
                                                                <TableHead>Labour</TableHead>
                                                                <TableHead className="text-right">
                                                                    Final Price
                                                                </TableHead>
                                                                <TableHead>Status</TableHead>
                                                                <TableHead className="w-28" />
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {groupItems.map((item) => (
                                                                <ItemTableRow
                                                                    key={item.id}
                                                                    item={item}
                                                                    canEditItems={canEditItems}
                                                                    onView={() => setViewingItem(item)}
                                                                    onEdit={() => openEditItemDialog(item)}
                                                                    onDelete={() => handleDeleteItem(item)}
                                                                    onReopen={() => handleReopenItem(item)}
                                                                />
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>

                                                <Separator />

                                                <div className="space-y-1">
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
                                                        <p className="font-semibold text-gray-900">
                                                            Estimated Group Total
                                                        </p>
                                                        <p className="font-semibold text-gray-900">
                                                            {formatCurrency(breakdown.grand_total)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <Separator />

                                                {/* Estimation form — dikasih kotak sendiri supaya
                                                    jelas ini "dokumen", terpisah secara visual dari
                                                    breakdown angka di atasnya. */}
                                                <div className="rounded-lg border border-vw-grey/10 p-3">
                                                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                                        <FileText className="h-4 w-4 text-vw-grey" />
                                                        Estimation Form
                                                    </p>

                                                    {!canEditEstimationDocs && (
                                                        <p className="text-xs text-vw-grey">
                                                            Estimation forms can only be uploaded or changed
                                                            while the order is at Appointment or Work In
                                                            Progress.
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
                                            </TabsContent>
                                        );
                                    })}
                                </Tabs>
                            </CardContent>
                        </Card>
                    )}

                    {(order.inspection_items?.length ?? 0) === 0 && (
                        <Card>
                            <CardContent className="py-8 text-center text-sm text-vw-grey">
                                No inspection items yet.
                            </CardContent>
                        </Card>
                    )}

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
                                    <div className="flex items-center gap-1">
                                        <p className="font-semibold text-gray-900">Estimated Grand Total</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-3.5 w-3.5 shrink-0 text-vw-grey" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-64">
                                                Includes approved items (locked) and pending
                                                items (still an estimate — may change until
                                                decided).
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <p className="font-semibold text-gray-900">
                                        {formatCurrency(grandTotal)}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between border-t border-vw-grey/10 pt-1.5">
                                    <div className="flex items-center gap-1">
                                        <p className="font-medium text-gray-900">Confirmed Total</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-3.5 w-3.5 shrink-0 text-vw-grey" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-64">
                                                Approved items only — final and locked, will
                                                not change.
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
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
                                        <div
                                            className={cn(
                                                'grid gap-2',
                                                availableTransitions.length > 1 && 'grid-cols-2'
                                            )}
                                        >
                                            {availableTransitions.map((status) => {
                                                const disabled =
                                                    status === 'completed' && !hasInvoice;
                                                const isDestructive =
                                                    status === 'all_rejected_cancelled';
                                                return (
                                                    <Button
                                                        key={status}
                                                        type="button"
                                                        variant={isDestructive ? 'outline' : 'default'}
                                                        className={cn(
                                                            isDestructive &&
                                                                'border-urgent text-urgent hover:bg-urgent/10 hover:text-urgent'
                                                        )}
                                                        disabled={disabled || processing}
                                                        onClick={() => handleSelectStatus(status)}
                                                    >
                                                        {STATUS_LABEL[status]}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                        {isCompletedBlocked && (
                                            <Alert>
                                                <Info className="h-4 w-4" />
                                                <AlertTitle className="text-sm">Invoice required</AlertTitle>
                                                <AlertDescription className="text-xs">
                                                    Upload at least 1 invoice PDF before this order can be marked completed.
                                                </AlertDescription>
                                            </Alert>
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
                            tinggal paste manual ke WhatsApp customer. Muncul HANYA
                            saat status work_in_progress — hilang lagi begitu order
                            pindah ke quality_control dan seterusnya. */}
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

                        {/* Invoice PDF section — disembunyikan selama appointment/
                            work_in_progress, baru muncul mulai quality_control. */}
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

                        {/* Payment — FIX (layout): sebelumnya 5 sub-fungsi (bank info,
                            invoice details, customer receipt, staff receipt, report to
                            cashier) ditumpuk jadi 1 card panjang. Sekarang dipecah pakai
                            Accordion, "Invoice Details" default terbuka karena itu yang
                            paling sering dicek/diedit duluan. */}
                        {showPaymentSection && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Payment</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Accordion
                                        type="single"
                                        collapsible
                                        defaultValue="invoice-details"
                                    >
                                        <AccordionItem value="bank-accounts">
                                            <AccordionTrigger>Bank Accounts</AccordionTrigger>
                                            <AccordionContent>
                                                <div className="space-y-1.5 rounded-md bg-vw-grey-light p-3 text-xs">
                                                    {BANK_ACCOUNTS.map((acc) => (
                                                        <div key={acc.bank}>
                                                            <p className="font-semibold text-gray-900">
                                                                {acc.bank}
                                                            </p>
                                                            <p className="text-vw-grey">{acc.account}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="invoice-details">
                                            <AccordionTrigger>Invoice Details</AccordionTrigger>
                                            <AccordionContent>
                                                {canEditPayment ? (
                                                    <form
                                                        onSubmit={handlePaymentDetailsSubmit}
                                                        className="space-y-2"
                                                    >
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
                                                                    paymentDetailsForm.setData(
                                                                        'bill_to',
                                                                        e.target.value
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                        <Button
                                                            type="submit"
                                                            size="sm"
                                                            disabled={paymentDetailsForm.processing}
                                                        >
                                                            {paymentDetailsForm.processing
                                                                ? 'Saving...'
                                                                : 'Save'}
                                                        </Button>
                                                    </form>
                                                ) : (
                                                    <div className="space-y-1 text-sm">
                                                        <p>
                                                            <span className="text-vw-grey">
                                                                Invoice Number:
                                                            </span>{' '}
                                                            {order.invoice_number ?? '—'}
                                                        </p>
                                                        <p>
                                                            <span className="text-vw-grey">Bill To:</span>{' '}
                                                            {order.bill_to ?? '—'}
                                                        </p>
                                                    </div>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="receipts">
                                            <AccordionTrigger>Receipts</AccordionTrigger>
                                            <AccordionContent className="space-y-4">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        Customer Receipt
                                                    </p>
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

                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">
                                                        Staff Receipt
                                                    </p>
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
                                                        <p className="text-sm text-vw-grey">
                                                            No receipt uploaded yet.
                                                        </p>
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
                                                                {staffReceiptForm.processing
                                                                    ? 'Uploading...'
                                                                    : 'Upload'}
                                                            </Button>
                                                        </form>
                                                    )}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {canEditPayment && (
                                            <AccordionItem value="report-to-cashier">
                                                <AccordionTrigger>Report to Cashier</AccordionTrigger>
                                                <AccordionContent className="space-y-2">
                                                    {!canReportToCashier && (
                                                        <p className="text-xs text-amber-600">
                                                            Fill in Invoice Number, Bill To, and upload
                                                            at least one receipt before reporting to
                                                            cashier.
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
                                                                <Copy className="mr-1 h-4 w-4" /> Copy
                                                                Message
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
                                                        1) Download the receipt · 2) Copy the message ·
                                                        3) Open the group and paste the message + attach
                                                        the receipt manually.
                                                    </p>
                                                </AccordionContent>
                                            </AccordionItem>
                                        )}
                                    </Accordion>
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

            {/* View Item Dialog — read-only, tersedia untuk semua item apapun
                statusnya (termasuk approved, yang tidak lagi bisa dibuka lewat
                Edit). Menampilkan semua detail sekunder yang di-drop dari
                tabel: description, harga+discount, final price, decided_at. */}
            <Dialog open={!!viewingItem} onOpenChange={(open) => !open && setViewingItem(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{viewingItem?.name}</DialogTitle>
                    </DialogHeader>
                    {viewingItem && (
                        <div className="space-y-4 text-sm">
                            <div>
                                <p className="text-vw-grey">Description</p>
                                <p className="text-gray-900">
                                    {viewingItem.description || (
                                        <span className="text-vw-grey">No description.</span>
                                    )}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-vw-grey">Part Price</p>
                                    <p className="text-gray-900">
                                        {formatCurrency(viewingItem.cost_item)}
                                        {Number(viewingItem.discount_item_percent) > 0 &&
                                            ` (-${viewingItem.discount_item_percent}%)`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-vw-grey">Labour Price</p>
                                    <p className="text-gray-900">
                                        {formatCurrency(viewingItem.cost_labour)}
                                        {Number(viewingItem.discount_labour_percent) > 0 &&
                                            ` (-${viewingItem.discount_labour_percent}%)`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-vw-grey">Final Price</p>
                                    <p className="text-gray-900">
                                        {viewingItem.final_price_snapshot !== null &&
                                        viewingItem.final_price_snapshot !== undefined
                                            ? formatCurrency(viewingItem.final_price_snapshot)
                                            : 'Not locked yet'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-vw-grey">Decided At</p>
                                    <p className="text-gray-900">
                                        {viewingItem.decided_at
                                            ? formatDate(viewingItem.decided_at)
                                            : '—'}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <p className="text-vw-grey">Status</p>
                                <Badge
                                    variant={ITEM_STATUS_VARIANT[viewingItem.status] ?? 'secondary'}
                                >
                                    {ITEM_STATUS_LABEL[viewingItem.status] ?? viewingItem.status}
                                </Badge>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setViewingItem(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Item Dialog — dipicu dari tombol "Add Item" tiap tab group,
                atau dari selector "Add Item to a New Group" untuk group yang
                belum punya tab sama sekali. */}
            <Dialog
                open={!!addDialogGroup}
                onOpenChange={(open) => !open && closeAddItemDialog()}
            >
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            Add Item {addDialogGroup && `— ${GROUP_LABEL[addDialogGroup]}`}
                        </DialogTitle>
                    </DialogHeader>
                    <ItemFormFields
                        data={addItemForm.data}
                        errors={addItemForm.errors}
                        onChange={(field, value) => addItemForm.setData(field, value)}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeAddItemDialog}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleAddItemSubmit}
                            disabled={addItemForm.processing || !addItemForm.data.name.trim()}
                        >
                            {addItemForm.processing ? 'Saving...' : 'Add Item'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Item Dialog — cuma dipicu untuk item yang belum approved
                (lihat guard di ItemTableRow). */}
            <Dialog
                open={!!editingItem}
                onOpenChange={(open) => !open && closeEditItemDialog()}
            >
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Item</DialogTitle>
                    </DialogHeader>

                    {editingItem?.status === 'approved' && (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle className="text-sm">This item was already approved</AlertTitle>
                            <AlertDescription className="text-xs">
                                Saving changes will reset it to "Waiting Approval" — the customer
                                will need to review and approve it again.
                            </AlertDescription>
                        </Alert>
                    )}

                    <ItemFormFields
                        data={editItemForm.data}
                        errors={editItemForm.errors}
                        onChange={(field, value) => editItemForm.setData(field, value)}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeEditItemDialog}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleEditItemSubmit}
                            disabled={editItemForm.processing || !editItemForm.data.name.trim()}
                        >
                            {editItemForm.processing ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
        </TooltipProvider>
    );
}