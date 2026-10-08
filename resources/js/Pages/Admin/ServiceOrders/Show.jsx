import { useState, useEffect, useId } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, router, usePage, Link, Head } from '@inertiajs/react';
import { toast } from 'sonner';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Checkbox } from '@/Components/ui/checkbox';
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
} from '@/Components/ui/tabs';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/Components/ui/tooltip';
import { Alert, AlertTitle, AlertDescription } from '@/Components/ui/alert';
import { Separator } from '@/Components/ui/separator';
import {
    ChevronDown,
    ArrowRight,
    ArrowLeft,
    Plus,
    Trash2,
    RotateCcw,
    Copy,
    Check,
    FileText,
    PlayCircle,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePollLastActivity } from '@/hooks/usePollLastActivity';

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
    work_in_progress: 'Work In Process',
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

// Dipakai preview file: gambar tampil lewat <img>, sisanya (PDF) lewat <iframe>.
function isImageFile(url) {
    return /\.(jpe?g|png|gif|webp)$/i.test(url ?? '');
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

// Support link YouTube lama (video_source 'external_link', PROJECT-RULES
// 9.4 — opsi ini sudah dihapus dari UI Create tapi data lama & enum backend
// masih mengizinkannya). Video upload baru (mp4) langsung diputar via <video>.
function youtubeEmbedUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        let videoId = null;
        if (parsed.hostname.includes('youtu.be')) {
            videoId = parsed.pathname.slice(1);
        } else if (parsed.hostname.includes('youtube.com')) {
            if (parsed.pathname === '/watch') {
                videoId = parsed.searchParams.get('v');
            } else if (parsed.pathname.startsWith('/embed/')) {
                return url;
            }
        }
        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    } catch {
        return null;
    }
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
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-vw-grey-light',
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

// Tombol teks "Edit" / "Delete" — pengganti ikon pensil & tempat sampah.
// Edit: outline netral. Delete: outline merah (token `urgent`), tidak solid
// supaya tidak menyaingi tombol View di baris yang sama. `label` jadi
// aria-label (mis. "Delete invoice") karena teks tombol cuma satu kata.
function TextActionButton({ text, label, onClick, tone = 'default', className }) {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClick}
            aria-label={label}
            className={cn(
                className,
                tone === 'danger' &&
                    'border-urgent/40 text-urgent hover:border-urgent hover:bg-urgent/10 hover:text-urgent'
            )}
        >
            {text}
        </Button>
    );
}

// Tombol "View" (teks saja, tanpa ikon) — satu komponen untuk semua aksi lihat
// (item, estimation form, invoice, receipt). Gaya SAMA dengan tombol
// "Preview Inspection Video": Button variant default, size sm.
// Selalu <button> yang membuka modal, bukan link href. `label` dipakai
// sebagai aria-label supaya pembaca layar tahu apa yang dilihat.
function ViewButton({ label, onClick, disabled = false, className }) {
    return (
        <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={className}
        >
            View
        </Button>
    );
}

// Input harga dengan pemisah ribuan real-time (mis. 10.000.000), sama
// seperti di Create.jsx — nilai yang dikirim ke form state tetap angka
// murni tanpa titik (string of digits), kompatibel dengan validasi
// backend 'numeric'.
function CurrencyInput({ id, value, onChange, placeholder, disabled }) {
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
                disabled={disabled}
                className="pl-9"
            />
        </div>
    );
}

// Penanda field wajib diisi — sama seperti RequiredMark di Create.jsx.
function RequiredMark() {
    return (
        <span className="ml-0.5 text-urgent" aria-hidden="true">
            *
        </span>
    );
}

// Field wajib untuk sebuah item (semua kecuali description) — selaras dengan
// REQUIRED_ITEM_FIELDS di Create.jsx. Dipakai untuk enable/disable tombol
// Save di dialog Add & Edit.
const REQUIRED_ITEM_FIELDS = ['name', 'cost_item', 'cost_labour', 'group'];

function isItemComplete(item) {
    return REQUIRED_ITEM_FIELDS.every((field) => {
        const value = item?.[field];
        return value !== null && value !== undefined && String(value).trim() !== '';
    });
}

// Field set item — dipakai bareng oleh Dialog Add & Edit, layout & urutannya
// disamakan dengan ItemFields di Create.jsx (grid 2 kolom; Labour: harga +
// diskon sebaris, lalu Part: harga + diskon sebaris; Group di paling bawah).
function ItemFormFields({ data, errors, onChange, groups }) {
    const uid = useId();
    const fid = (f) => `${uid}-${f}`;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={fid('name')}>
                    Item Name
                    <RequiredMark />
                </Label>
                <Input id={fid('name')}
                    value={data.name}
                    onChange={(e) => onChange('name', e.target.value)}
                    placeholder="e.g. Brake pad replacement"
                />
                {errors.name && <p className="text-sm text-urgent">{errors.name}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={fid('description')}>Description (optional)</Label>
                <Textarea id={fid('description')}
                    value={data.description}
                    onChange={(e) => onChange('description', e.target.value)}
                    rows={2}
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor={fid('cost_labour')}>
                    Labour Price
                    <RequiredMark />
                </Label>
                <CurrencyInput id={fid('cost_labour')}
                    value={data.cost_labour}
                    onChange={(v) => onChange('cost_labour', v)}
                    placeholder="0"
                />
                {errors.cost_labour && (
                    <p className="text-sm text-urgent">{errors.cost_labour}</p>
                )}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={fid('discount_labour')}>Labour Discount (%)</Label>
                <Input id={fid('discount_labour')}
                    type="number"
                    min="0"
                    max="100"
                    value={data.discount_labour_percent}
                    onChange={(e) => onChange('discount_labour_percent', e.target.value)}
                    placeholder="0"
                />
                {errors.discount_labour_percent && (
                    <p className="text-sm text-urgent">{errors.discount_labour_percent}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor={fid('cost_item')}>
                    Part Price
                    <RequiredMark />
                </Label>
                <CurrencyInput id={fid('cost_item')}
                    value={data.cost_item}
                    onChange={(v) => onChange('cost_item', v)}
                    placeholder="0"
                />
                {errors.cost_item && <p className="text-sm text-urgent">{errors.cost_item}</p>}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={fid('discount_item')}>Part Discount (%)</Label>
                <Input id={fid('discount_item')}
                    type="number"
                    min="0"
                    max="100"
                    value={data.discount_item_percent}
                    onChange={(e) => onChange('discount_item_percent', e.target.value)}
                    placeholder="0"
                />
                {errors.discount_item_percent && (
                    <p className="text-sm text-urgent">{errors.discount_item_percent}</p>
                )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label>
                    Group
                    <RequiredMark />
                </Label>
                <Select value={data.group} onValueChange={(v) => onChange('group', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                        {groups.map((g) => (
                            <SelectItem key={g} value={g}>
                                {GROUP_LABEL[g] ?? g}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.group && <p className="text-sm text-urgent">{errors.group}</p>}
            </div>
        </div>
    );
}

// Baris item bergaya "struk" — 1 kartu vertikal per item, sama seperti
// ItemReceiptRow di Create.jsx (step 2), ditambah kolom yang hanya ada di
// Show: badge status item + aksi View/Edit/Delete/Reopen. Nama item bisa
// diklik untuk buka View Dialog (read-only, tersedia untuk semua status
// termasuk approved). Edit/Delete untuk non-approved (Delete cuma pending),
// Reopen khusus rejected.
function ItemReceiptRow({ item, canEditItems, onView, onEdit, onDelete, onReopen }) {
    const isLocked =
        item.final_price_snapshot !== null && item.final_price_snapshot !== undefined;

    return (
        <div className="rounded-md border border-vw-grey/15 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={onView}
                            className="truncate text-left text-sm font-medium text-gray-900 hover:text-vw-light-blue"
                        >
                            {item.name}
                        </button>
                        <Badge
                            variant={ITEM_STATUS_VARIANT[item.status] ?? 'secondary'}
                            className="text-[10px] font-normal"
                        >
                            {ITEM_STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                    </div>
                    {item.description && (
                        <p className="mt-0.5 truncate text-xs text-vw-grey">{item.description}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <ViewButton label="View item" onClick={onView} />
                    {canEditItems && item.status !== 'rejected' && (
                        <TextActionButton text="Edit" label="Edit item" onClick={onEdit} />
                    )}
                    {canEditItems && item.status === 'pending' && (
                        <TextActionButton text="Delete" label="Delete item" tone="danger" onClick={onDelete} />
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
            </div>

            <div className="mt-2 space-y-0.5 text-xs text-vw-grey">
                <div className="flex justify-between">
                    <span>
                        Labour
                        {Number(item.discount_labour_percent) > 0 &&
                            ` (-${item.discount_labour_percent}%)`}
                    </span>
                    <span>{formatCurrency(item.cost_labour)}</span>
                </div>
                <div className="flex justify-between">
                    <span>
                        Part
                        {Number(item.discount_item_percent) > 0 &&
                            ` (-${item.discount_item_percent}%)`}
                    </span>
                    <span>{formatCurrency(item.cost_item)}</span>
                </div>
            </div>

            <div className="mt-1.5 flex justify-between border-t border-dashed border-vw-grey/25 pt-1.5 text-sm font-semibold text-gray-900">
                <span>{isLocked ? 'Final Price' : 'Subtotal'}</span>
                <span>{formatCurrency(itemDisplayTotal(item))}</span>
            </div>
        </div>
    );
}

// Container generik untuk section di bawah panel Inspection Items (Invoice
// PDF, Payment) — border + header tipis, senada dengan panel Inspection Items
// dan tanpa Card supaya konsisten dengan gaya halaman Create.
function Panel({ title, children }) {
    return (
        <div className="rounded-lg border border-vw-grey/15 bg-white">
            <div className="border-b border-vw-grey/10 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">{title}</p>
            </div>
            <div className="space-y-3 px-4 py-3">{children}</div>
        </div>
    );
}

export default function Show({
    order,
    settings,
    maxInvoices,
    breakdownByGroup,
    estimatedGrandTotal,
    customerComplaintEditable,
    inspectionFeeEditable,
}) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === 'admin';

    // Polling + change-detection (PROJECT-RULES.md bagian 12) — supaya SA/admin
    // tidak perlu refresh manual saat customer approve/reject item dari link
    // publik sementara halaman ini masih terbuka. Tombol "Refresh Page" sudah
    // dihapus karena tidak dipakai lagi.
    usePollLastActivity({
        url: route('admin.service-orders.last-activity', order.id),
        initialValue: order.last_activity_at,
        only: [
            'order',
            'breakdownByGroup',
            'estimatedGrandTotal',
            'customerComplaintEditable',
            'inspectionFeeEditable',
        ],
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

    // Modal preview Inspection Video (video tidak lagi di-embed memanjang).
    const [videoOpen, setVideoOpen] = useState(false);

    // Dialog Upload/Replace Video — dipakai untuk mengisi video pertama kali
    // (order lama yang belum pernah punya video) maupun mengganti video yang
    // rusak/hilang (kasus migrasi http->https). Tidak digate oleh
    // order.status, lihat komentar di ServiceOrderController::uploadVideo().
    const [videoUploadOpen, setVideoUploadOpen] = useState(false);
    const videoUploadForm = useForm({
        file: null,
    });

    const closeVideoUploadDialog = () => {
        setVideoUploadOpen(false);
        videoUploadForm.reset();
        videoUploadForm.clearErrors();
    };

    const handleVideoUploadSubmit = () => {
        videoUploadForm.post(route('admin.service-orders.upload-video', order.id), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: (page) => {
                if (flashToast(page, 'Video uploaded successfully.')) {
                    closeVideoUploadDialog();
                }
            },
        });
    };

    // Modal preview file (receipt) — { title, url } atau null kalau tertutup.
    const [previewFile, setPreviewFile] = useState(null);

    // Mode edit inline Customer Complaint (lewat ikon pensil).
    const [isEditingComplaint, setIsEditingComplaint] = useState(false);

    // Mode edit Invoice Number & Bill To — setelah tersimpan tampil read-only,
    // baru jadi form lagi kalau SA klik ikon pensil.
    const [isEditingPaymentDetails, setIsEditingPaymentDetails] = useState(false);

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

    // Form khusus inspection fee — editable SA selama status masih
    // termasuk INSPECTION_FEE_EDITABLE_STATUSES di backend (guard sumber
    // kebenaran tetap di ServiceOrder::isInspectionFeeEditable(), dikirim
    // lewat prop `inspectionFeeEditable`, pola sama dengan customer complaint
    // di atas).
    const inspectionFeeForm = useForm({
        inspection_fee: order.inspection_fee ?? '',
        inspection_fee_note: order.inspection_fee_note ?? '',
    });

    // Toggle tampilan Inspection Fee: default read-only (nilai "paten"),
    // baru masuk mode form kalau SA klik ikon pensil. Direset ke false tiap
    // habis save/cancel biar nggak nyangkut kebuka.
    const [isEditingFee, setIsEditingFee] = useState(false);

    // Checkbox "fee sudah termasuk di part & labour" murni aksi UI — TIDAK
    // ada kolom database terpisah untuk ini (sengaja, biar tidak nambah
    // migration baru). Efeknya cuma: set inspection_fee jadi 0 + isi
    // inspection_fee_note dengan teks default (SA masih bisa edit teksnya).
    // Konsekuensinya: checkbox ini tidak "diingat" lagi begitu form ditutup
    // & dibuka ulang — tapi itu nggak masalah, karena begitu tersimpan,
    // Rp 0 + catatan "Sudah termasuk di harga part & labour" sudah cukup
    // jelas dibaca di tampilan read-only-nya.
    const [feeIncludedChecked, setFeeIncludedChecked] = useState(false);
    const FEE_INCLUDED_NOTE_TEXT = 'Fee sudah termasuk di harga part & labour.';

    const availableTransitions = ALLOWED_TRANSITIONS[order.status] ?? [];
    const revertTarget = REVERT_TRANSITIONS[order.status] ?? null;

    const invoice = order.invoice;
    const hasInvoice = !!invoice;

    // Kriteria arsitektur final (PROJECT-RULES 9.4 & 1J): 1 video per Service
    // Order, diinput sekali saat Create, tidak ada endpoint update/ganti di
    // Show. Video ini harus tetap kelihatan di halaman admin di STATUS
    // APAPUN (appointment s/d completed) — tidak digate oleh order.status,
    // beda dengan Edit/Delete item yang dibatasi ITEM_EDITABLE_STATUSES.
    const video = order.videos?.[0] ?? null;
    const videoEmbedUrl = video ? youtubeEmbedUrl(video.video_url) : null;

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
            onSuccess: (page) => {
                const ok = flashToast(page, 'Customer complaint saved');
                if (ok) setIsEditingComplaint(false);
            },
            onError: () => toast.error('Failed to save customer complaint'),
        });
    };

    const handleComplaintCancel = () => {
        complaintForm.clearErrors();
        complaintForm.setData('customer_complaint', order.customer_complaint ?? '');
        setIsEditingComplaint(false);
    };

    // --- Inspection fee ---

    const handleInspectionFeeSubmit = (e) => {
        e.preventDefault();
        inspectionFeeForm.patch(route('admin.service-orders.update-inspection-fee', order.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                flashToast(page, 'Inspection fee updated');
                setIsEditingFee(false);
                setFeeIncludedChecked(false);
            },
            onError: () => toast.error('Failed to update inspection fee'),
        });
    };

    const handleInspectionFeeCancel = () => {
        inspectionFeeForm.clearErrors();
        inspectionFeeForm.setData({
            inspection_fee: order.inspection_fee ?? '',
            inspection_fee_note: order.inspection_fee_note ?? '',
        });
        setFeeIncludedChecked(false);
        setIsEditingFee(false);
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
        const targetGroup = addItemForm.data.group;
        addItemForm.post(route('admin.service-orders.inspection-items.store', order.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Item added');
                if (ok) {
                    // Pindah ke tab group tujuan supaya item baru langsung kelihatan.
                    setActiveGroupTab(targetGroup);
                    closeAddItemDialog();
                }
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
        const targetGroup = editItemForm.data.group;
        editItemForm.patch(
            route('admin.service-orders.inspection-items.update', [order.id, editingItem.id]),
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const ok = flashToast(page, 'Item updated');
                    if (ok) {
                        setActiveGroupTab(targetGroup);
                        closeEditItemDialog();
                    }
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

    const [activeGroupTab, setActiveGroupTab] = useState(null);
    const currentGroupTab =
        activeGroupTab && groupsWithItems.includes(activeGroupTab)
            ? activeGroupTab
            : groupsWithItems[0];

    // --- Totals ---

    // "Confirmed Total" — cuma item yang sudah approved (final_price_snapshot
    // sudah termasuk VAT saat dikunci, tidak pernah berubah lagi).
    const grandTotalApproved =
        order.inspection_items
            ?.filter((item) => item.status === 'approved')
            .reduce((sum, item) => sum + Number(item.final_price_snapshot ?? 0), 0) ?? 0;

    // "Grand Total" final di card Order Totals = Confirmed Total + Inspection
    // Fee (bukan lagi Estimated). Inspection fee jasa cek awal, terpisah dari
    // harga per-item, ditambahkan langsung di sini.
    const finalGrandTotal = grandTotalApproved + Number(order.inspection_fee ?? 0);

    // Catatan: "Estimated Grand Total" gabungan semua group (card terpisah,
    // di bawah breakdown per group) TIDAK dihitung di sini lagi — datang
    // dari prop `estimatedGrandTotal` (backend, InspectionItemPricingService::
    // estimatedGrandTotalForOrder()) karena sengaja menghitung SEMUA item
    // apapun statusnya termasuk rejected, beda dari itemContribution() yang
    // dipakai breakdown per group.

    const isCompletedBlocked = !hasInvoice && availableTransitions.includes('completed');

    const hasReceipt = !!(order.customer_payment_receipt || order.staff_payment_receipt);
    const hasPaymentDetails = !!(order.invoice_number && order.bill_to);
    const canReportToCashier = hasReceipt && hasPaymentDetails;

    const handlePaymentDetailsSubmit = (e) => {
        e.preventDefault();
        paymentDetailsForm.patch(route('admin.service-orders.update-payment-details', order.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                const ok = flashToast(page, 'Payment details saved');
                if (ok) setIsEditingPaymentDetails(false);
            },
            onError: () => toast.error('Failed to save payment details'),
        });
    };

    const handlePaymentDetailsCancel = () => {
        paymentDetailsForm.clearErrors();
        paymentDetailsForm.setData({
            invoice_number: order.invoice_number ?? '',
            bill_to: order.bill_to ?? '',
        });
        setIsEditingPaymentDetails(false);
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

    // Helper copy-to-clipboard dengan fallback.
    // navigator.clipboard.writeText() bisa gagal/tidak tersedia di beberapa
    // browser/device (in-app browser, permission ditolak, browser lama, dll),
    // jadi kalau itu gagal kita fallback ke document.execCommand('copy') lewat
    // textarea tersembunyi — caranya lebih tua tapi jauh lebih kompatibel.
    // Return true kalau berhasil (lewat cara apapun), false kalau dua-duanya gagal.
    const copyToClipboard = async (text) => {
        // Coba cara modern dulu.
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // lanjut ke fallback di bawah
            }
        }

        // Fallback: textarea tersembunyi + execCommand('copy').
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;

            // Hindari scroll/zoom aneh & tetap sembunyi dari layar.
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.width = '2em';
            textarea.style.height = '2em';
            textarea.style.padding = '0';
            textarea.style.border = 'none';
            textarea.style.outline = 'none';
            textarea.style.boxShadow = 'none';
            textarea.style.background = 'transparent';
            textarea.style.opacity = '0';

            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            // Untuk mobile Safari, perlu set selection range eksplisit.
            textarea.setSelectionRange(0, textarea.value.length);

            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);

            return successful;
        } catch {
            return false;
        }
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
        const success = await copyToClipboard(cashierMessageText);
        if (success) {
            setCopied(true);
            toast.success('Message copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } else {
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

    // Nama customer diambil dari relasi vehicle->customer yang terikat ke order ini.
    // Fallback ke sapaan generik lama kalau data customer belum lengkap (jangan sampai
    // pesan jadi "Selamat Sore ," / nama kosong).
    const customerName = order.vehicle?.customer?.name;
    const customerGreetingName = customerName
        ? `Bapak/Ibu ${customerName}`
        : 'Bapak/Ibu Pelanggan VW PIK';

    const reportMessageText =
        `Selamat ${getGreeting()} ${customerGreetingName}, berikut kami kirimkan link laporan hasil inspeksi dan estimasi kendaraan Anda (${vehicleLabel}):\n\n` +
        `${reportUrl ?? '-'}\n\n` +
        `Di dalamnya ada video hasil pengecekan dari teknisi kami dan rincian biaya perbaikan. Mohon dapat di cek dan saya tunggu persetujuan dari bapak/ibu selanjutnya. Terima kasih.`;

    const handleCopyReportLink = async () => {
        const success = await copyToClipboard(reportMessageText);
        if (success) {
            setReportLinkCopied(true);
            toast.success('Report link & message copied to clipboard');
            setTimeout(() => setReportLinkCopied(false), 2000);
        } else {
            toast.error('Failed to copy — please copy the text manually');
        }
    };

    // --- Derived values untuk panel Inspection Items ---
    const allItems = order.inspection_items ?? [];
    const itemsInGroup = currentGroupTab
        ? allItems.filter((item) => item.group === currentGroupTab)
        : [];
    const groupBreakdown = breakdownByGroup?.[currentGroupTab] ?? {
        subtotal: 0,
        vat_amount: 0,
        grand_total: 0,
    };
    // Estimation form milik tab yang sedang aktif (footer ikut berganti).
    const estimationDoc = currentGroupTab ? docsByGroup[currentGroupTab] : null;
    const hasEstimationFile = !!estimationDoc?.pdf_path;
    // Estimated Grand Total sekarang sudah termasuk Inspection Fee
    // (dipindah dari Order Totals). Nilai dasar tetap dari backend.
    const estimatedGrandTotalWithFee =
        Number(estimatedGrandTotal?.grand_total ?? 0) + Number(order.inspection_fee ?? 0);

    // Layout section 3: kalau sudah ada inspection item DAN Invoice &
    // Payment sudah muncul, keduanya ditaruh sebelahan (grid 2 kolom, lebar
    // penuh) supaya makin lega. Selama belum ada item (grid Inspection
    // Items belum tampil), section tetap 1 kolom di tengah seperti biasa.
    const showInvoiceSideBySide = allItems.length > 0 && showInvoiceSection;

    // Form Invoice Number/Bill To tampil kalau belum pernah disimpan, atau
    // SA sedang mengedit lewat ikon pensil.
    const showPaymentDetailsForm =
        canEditPayment && (!hasPaymentDetails || isEditingPaymentDetails);

    return (
        <TooltipProvider delayDuration={200}>
        <AdminLayout
            title={
                <>
                    <span className="truncate">
                        Service Order #{order.work_order_number ?? order.id}
                    </span>
                    <span className="hidden min-w-0 truncate text-sm font-normal text-vw-grey sm:inline">
                        {[order.vehicle?.plate_number, order.vehicle?.model, order.vehicle?.customer?.name].filter(Boolean).join(' · ')}
                    </span>
                    <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                        {STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                    {order.status === 'invoice_preparation' && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                            Waiting for Pickup
                        </Badge>
                    )}
                </>
            }
        >
            <Head title={`Service Order #${order.work_order_number ?? order.id}`} />

            {/* ============================================================
                1. ORDER OVERVIEW + CUSTOMER
                Lebar & padding disamakan dengan halaman Create (max-w-2xl,
                mx-auto, px-4 sm:px-0) supaya konten utama ada di tengah.
                Tanpa Card — pakai Separator hairline seperti Create.
               ============================================================ */}
            <div className="mx-auto max-w-6xl space-y-5 px-4 sm:px-0">
                <details open className="group rounded-lg border border-vw-grey/15 bg-white">
                    <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-4 py-2 text-sm [&::-webkit-details-marker]:hidden">
                        <Link
                            href={route('admin.service-orders.index', { group: order.status === 'completed' ? 'completed' : 'in_process' })}
                            aria-label="Back to service orders"
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vw-grey/30 text-vw-grey hover:bg-vw-grey-light"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold text-gray-900">{order.vehicle?.plate_number ?? '—'}</span>
                            <span className="text-vw-grey">
                                {' '}· {order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model}` : '—'} · {order.vehicle?.customer?.name ?? '—'} · {order.vehicle?.customer?.phone ?? '—'}
                            </span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-600 group-open:hidden">Show details</span>
                        <span className="hidden shrink-0 text-xs text-gray-600 group-open:inline">Hide details</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-vw-grey transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-5 border-t border-vw-grey/10 px-4 py-4">
                {/* Order Overview */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                            Order Overview
                        </p>
                        {/* Delete order — admin-only, dipindah ke header overview
                            karena header lama sudah dihapus. */}
                        {isAdmin && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-urgent hover:text-urgent"
                                onClick={handleDeleteOrder}
                            >
                                <Trash2 className="mr-1 h-4 w-4" /> Delete Order
                            </Button>
                        )}
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="text-vw-grey">Work Order Number</p>
                            <p className="font-medium text-gray-900">
                                {order.work_order_number ?? '—'}
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
                    </div>
                </div>

                <Separator />

                {/* Customer data */}
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                        Customer
                    </p>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="text-vw-grey">Name</p>
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
                                    ? `${order.vehicle.brand} ${order.vehicle.model} — ${order.vehicle.plate_number}`
                                    : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-vw-grey">VIN/Chasis Number</p>
                            <p className="font-medium text-gray-900">
                                {order.vehicle?.vin ?? '—'}
                            </p>
                        </div>

                        {/* Customer Complaint — editable lewat ikon pensil saat
                            appointment & work_in_progress saja (guard sumber
                            kebenaran di backend, lihat
                            ServiceOrder::isCustomerComplaintEditable()). */}
                        <div className="sm:col-span-2">
                            <div className="flex items-center gap-1.5">
                                <p className="text-vw-grey">Customer Complaint</p>
                                {customerComplaintEditable && !isEditingComplaint && (
                                    <TextActionButton text="Edit" label="Edit complaint" onClick={() => setIsEditingComplaint(true)} />
                                )}
                            </div>
                            {customerComplaintEditable && isEditingComplaint ? (
                                <form onSubmit={handleComplaintSubmit} className="mt-1.5 space-y-2">
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
                                        autoFocus
                                    />
                                    {complaintForm.errors.customer_complaint && (
                                        <p className="text-sm text-urgent">
                                            {complaintForm.errors.customer_complaint}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-vw-grey">
                                            Editable until the order reaches Quality Control.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleComplaintCancel}
                                                disabled={complaintForm.processing}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={complaintForm.processing}
                                            >
                                                {complaintForm.processing ? 'Saving...' : 'Save'}
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <p className="text-gray-900">
                                    {order.customer_complaint || (
                                        <span className="text-vw-grey">No complaint recorded.</span>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Inspection Video — tidak lagi di-embed memanjang; cukup tombol
                    Preview yang membuka modal. Tetap TIDAK digate oleh
                    order.status (harus bisa dilihat di status apapun,
                    PROJECT-RULES 9.4). Tombol Copy Report Link (khusus
                    work_in_progress) ditaruh sebaris di sini karena kartu
                    "Report Link" di kolom kanan sudah tidak ada. */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={!video}
                        onClick={() => setVideoOpen(true)}
                    >
                        <PlayCircle className="mr-1 h-4 w-4" />
                        {video ? 'Preview Inspection Video' : 'No video uploaded'}
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVideoUploadOpen(true)}
                    >
                        {video ? 'Replace Video' : 'Upload Video'}
                    </Button>

                    {canShareReportLink && (
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={handleCopyReportLink}
                            disabled={!reportUrl}
                        >
                            {reportLinkCopied ? (
                                <>
                                    <Check className="mr-1 h-4 w-4" /> Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-1 h-4 w-4" /> Copy Report Link & Message
                                </>
                            )}
                        </Button>
                    )}
                </div>
                    </div>
                </details>
            </div>

            {/* ============================================================
                2. STATUS — sticky (nempel di bawah header admin, top-14,
                sama seperti stepper di Create). Full-bleed lewat -mx, isi
                dibatasi max-w-2xl. SA bisa pindah status kapan saja sambil
                scroll/edit konten di bawah.
               ============================================================ */}
            <div className="sticky top-14 z-10 -mx-4 mt-5 border-y border-vw-grey/10 bg-white px-4 sm:-mx-6 sm:px-6">
                <div className="mx-auto max-w-6xl space-y-2 py-2.5">
                    {/* Aksi: pindah ke status berikutnya (+ Revert untuk
                        admin, PROJECT-RULES bagian 7 poin 8). Badge status
                        sudah dipindah ke header admin (sebelah nomor work
                        order) supaya selalu kelihatan tanpa perlu scroll. */}
                    <div className="flex flex-wrap items-center gap-2">
                        {availableTransitions.length > 0 ? (
                            <>
                                <span className="text-sm text-vw-grey">Next step:</span>
                {availableTransitions
                    .filter((status) => status !== 'all_rejected_cancelled')
                    .map((status) => {
                        const disabled = status === 'completed' && !hasInvoice;
                        return (
                            <Button
                                key={status}
                                type="button"
                                disabled={disabled || processing}
                                onClick={() => handleSelectStatus(status)}
                            >
                                Move to {STATUS_LABEL[status]}
                                <ArrowRight className="ml-1.5 h-4 w-4" />
                            </Button>
                        );
                    })}
                {availableTransitions.includes('all_rejected_cancelled') && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-urgent hover:bg-urgent/10 hover:text-urgent"
                        disabled={processing}
                        onClick={() => handleSelectStatus('all_rejected_cancelled')}
                    >
                        Cancel order
                    </Button>
                )}
                            </>
                        ) : (
                            <p className="text-xs text-vw-grey">
                                Final status — no further transition.
                            </p>
                        )}

                        {isAdmin && revertTarget && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={cn('border-vw-grey/30 bg-white text-black hover:bg-vw-grey-light hover:text-black', !availableTransitions.includes('all_rejected_cancelled') && 'ml-auto')}
                                        onClick={handleRevertStatus}
                                    >
                                        <RotateCcw className="mr-1 h-4 w-4" />
                                        Revert to {STATUS_LABEL[revertTarget]}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-64">
                                    Admin only — use this if items need to be reopened for
                                    negotiation after this stage.
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    {isCompletedBlocked && (
                        <p className="flex items-center gap-1.5 text-xs text-amber-700">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            Upload at least 1 invoice PDF before this order can be marked
                            completed.
                        </p>
                    )}
                </div>
            </div>

            {/* ============================================================
                3. INSPECTION ITEMS + ESTIMATION + TOTALS, lalu INVOICE &
                PAYMENT di bawahnya.
               ============================================================ */}
            <div
                className="mx-auto mt-5 max-w-6xl space-y-5 px-4 sm:px-0"
            >
                <div
                    className="space-y-5"
                >
                {/* Panel Inspection Items — struktur sama dengan step 2 di
                    Create (header + tabs grup, body list struk, footer).
                    Beda: tinggi body dibatasi (max-h) alih-alih h-[70vh]
                    tetap, karena footer di sini lebih tinggi (estimation
                    form + estimated grand total + order totals). */}
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-vw-grey/15 bg-white">
                    {/* Header */}
                    <div className="shrink-0 space-y-3 border-b border-vw-grey/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    Inspection Items
                                </p>
                                <p className="text-xs text-vw-grey">
                                    {allItems.length} item{allItems.length !== 1 && 's'}
                                </p>
                            </div>
                            {canEditItems && (
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                        openAddItemDialog(currentGroupTab ?? GROUPS[0])
                                    }
                                >
                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
                                </Button>
                            )}
                        </div>

                        {groupsWithItems.length > 0 && currentGroupTab && (
                            <Tabs value={currentGroupTab} onValueChange={setActiveGroupTab}>
                                <TabsList className="w-full justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {groupsWithItems.map((group) => (
                                        <TabsTrigger key={group} value={group}>
                                            {GROUP_LABEL[group]}
                                            <Badge variant="secondary" className="ml-1.5">
                                                {
                                                    allItems.filter((item) => item.group === group)
                                                        .length
                                                }
                                            </Badge>
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                        )}
                    </div>

                    {/* Body — kalau belum ada item, tampilkan empty state
                        full-width. Kalau sudah ada, dipecah jadi 2 grid:
                        kiri daftar item (list struk), kanan semua angka
                        total (breakdown grup, estimation form, estimated
                        grand total, order totals) supaya tidak berdempet
                        dan gampang dibaca. */}
                    {allItems.length === 0 ? (
                        <div className="flex-1 px-4 py-3">
                            <div className="rounded-md border border-dashed border-vw-grey/40 py-10 text-center">
                                <p className="text-sm text-vw-grey">No inspection items yet.</p>
                                {canEditItems && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-3"
                                        onClick={() => openAddItemDialog(GROUPS[0])}
                                    >
                                        <Plus className="mr-1 h-4 w-4" /> Add your first item
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid flex-1 min-h-0 lg:grid-cols-[1.1fr_1fr] lg:gap-4">
                            {/* Kiri — daftar item, hanya grup aktif */}
                            <div className="h-full max-h-[60vh] min-h-[10rem] overflow-y-auto border-b border-vw-grey/10 px-4 py-3 lg:max-h-[70vh] lg:border-b-0 lg:border-r lg:pr-5">
                                <div className="space-y-2">
                                    {itemsInGroup.map((item) => (
                                        <ItemReceiptRow
                                            key={item.id}
                                            item={item}
                                            canEditItems={canEditItems}
                                            onView={() => setViewingItem(item)}
                                            onEdit={() => openEditItemDialog(item)}
                                            onDelete={() => handleDeleteItem(item)}
                                            onReopen={() => handleReopenItem(item)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Kanan — semua total: breakdown grup aktif,
                                estimation form, estimated grand total, order
                                totals. */}
                            <div className="h-full overflow-y-auto bg-vw-grey-light/20 px-4 py-3 lg:px-5">
                              <div className="flex flex-col gap-3">
                                {/* Breakdown grup yang lagi aktif (dari backend) */}
                                <div className="space-y-1 text-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                        {GROUP_LABEL[currentGroupTab]} Breakdown
                                    </p>
                                    <div className="flex justify-between">
                                        <span className="text-vw-grey">
                                            {GROUP_LABEL[currentGroupTab]} subtotal
                                        </span>
                                        <span className="text-gray-900">
                                            {formatCurrency(groupBreakdown.subtotal)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-vw-grey">VAT ({vatPercent}%)</span>
                                        <span className="text-gray-900">
                                            {formatCurrency(groupBreakdown.vat_amount)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between font-semibold text-gray-900">
                                        <span>Estimated {GROUP_LABEL[currentGroupTab]} Total</span>
                                        <span>{formatCurrency(groupBreakdown.grand_total)}</span>
                                    </div>
                                </div>

                                <Separator />

                            {/* Estimation Form — dinamis, ikut tab grup yang
                                sedang dipilih. */}
                            {currentGroupTab && (
                                <div className="order-last space-y-2 border-t border-vw-grey/10 pt-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                            <FileText className="h-4 w-4 text-vw-grey" />
                                            Estimation Form — {GROUP_LABEL[currentGroupTab]}
                                        </p>
                                        {hasEstimationFile && (
                                            <ViewButton label="View estimation form" onClick={() =>
                                                    setPreviewFile({
                                                        title: `Estimation Form — ${GROUP_LABEL[currentGroupTab]}`,
                                                        url: `/storage/${estimationDoc.pdf_path}`,
                                                    })
                                                }
                                            />
                                        )}
                                    </div>

                                    {hasEstimationFile && estimationDoc.uploaded_at && (
                                        <p className="text-xs text-vw-grey">
                                            Uploaded {formatDate(estimationDoc.uploaded_at)}
                                            {estimationDoc.uploaded_by?.name &&
                                                ` by ${estimationDoc.uploaded_by.name}`}
                                        </p>
                                    )}

                                    {!hasEstimationFile && (
                                        <p className="text-xs text-vw-grey">
                                            {canEditEstimationDocs
                                                ? 'No file uploaded yet.'
                                                : 'No file was uploaded for this group.'}
                                        </p>
                                    )}

                                    {canEditEstimationDocs ? (
                                        <form
                                            onSubmit={handleEstimationUpload}
                                            className="flex items-center gap-2"
                                        >
                                            <Input
                                                key={currentGroupTab}
                                                type="file"
                                                accept="application/pdf"
                                                className="min-w-0 flex-1 text-xs"
                                                onChange={(e) =>
                                                    handleEstimationFileChange(
                                                        currentGroupTab,
                                                        e.target.files[0]
                                                    )
                                                }
                                            />
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={
                                                    estimationForm.processing ||
                                                    selectedGroup !== currentGroupTab ||
                                                    !estimationForm.data.pdf
                                                }
                                            >
                                                {estimationForm.processing &&
                                                selectedGroup === currentGroupTab
                                                    ? 'Uploading...'
                                                    : hasEstimationFile
                                                    ? 'Replace'
                                                    : 'Upload'}
                                            </Button>
                                            {hasEstimationFile && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-urgent hover:text-urgent/80"
                                                    onClick={() =>
                                                        handleDeleteEstimationDoc(estimationDoc)
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </form>
                                    ) : (
                                        <p className="text-xs text-vw-grey">
                                            Estimation forms can only be uploaded or changed while
                                            the order is at Appointment or Work In Process.
                                        </p>
                                    )}

                                    {selectedGroup === currentGroupTab &&
                                        estimationForm.errors.pdf && (
                                            <p className="text-xs text-urgent">
                                                {estimationForm.errors.pdf}
                                            </p>
                                        )}
                                </div>
                            )}

                            {/* Estimated Grand Total — sekarang sudah termasuk
                                Inspection Fee (dipindah dari Order Totals). */}
                            <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                        Estimated Grand Total
                                    </p>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-3.5 w-3.5 shrink-0 text-vw-grey" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-64">
                                            Full quotation value — ALL inspection items across every
                                            group, regardless of status (pending, approved, or
                                            rejected), plus the inspection fee. Does not change
                                            based on approve/reject decisions.
                                        </TooltipContent>
                                    </Tooltip>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-vw-grey">Items Subtotal</span>
                                    <span className="text-gray-900">
                                        {formatCurrency(estimatedGrandTotal?.subtotal ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-vw-grey">VAT ({vatPercent}%)</span>
                                    <span className="text-gray-900">
                                        {formatCurrency(estimatedGrandTotal?.vat_amount ?? 0)}
                                    </span>
                                </div>

                                {/* Inspection Fee — default read-only, masuk mode
                                    edit lewat ikon pensil (guard sumber kebenaran
                                    di backend, ServiceOrder::isInspectionFeeEditable()). */}
                                {isEditingFee ? (
                                    <form
                                        onSubmit={handleInspectionFeeSubmit}
                                        className="space-y-2 border-t border-vw-grey/10 pt-1.5"
                                    >
                                        <div className="space-y-1.5">
                                            <Label htmlFor="inspection_fee" className="text-vw-grey">
                                                Inspection Fee
                                            </Label>
                                            <CurrencyInput
                                                id="inspection_fee"
                                                value={inspectionFeeForm.data.inspection_fee}
                                                onChange={(v) =>
                                                    inspectionFeeForm.setData('inspection_fee', v)
                                                }
                                                placeholder="0"
                                                disabled={feeIncludedChecked}
                                            />
                                            {inspectionFeeForm.errors.inspection_fee && (
                                                <p className="text-xs text-urgent">
                                                    {inspectionFeeForm.errors.inspection_fee}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-start gap-2 pt-1">
                                            <Checkbox
                                                id="inspection_fee_included"
                                                checked={feeIncludedChecked}
                                                onCheckedChange={(checked) => {
                                                    const isChecked = checked === true;
                                                    setFeeIncludedChecked(isChecked);
                                                    // Centang → paksa fee ke 0 & isi note
                                                    // default (masih bisa diedit manual).
                                                    if (isChecked) {
                                                        inspectionFeeForm.setData(
                                                            'inspection_fee',
                                                            '0'
                                                        );
                                                        if (
                                                            !inspectionFeeForm.data
                                                                .inspection_fee_note
                                                        ) {
                                                            inspectionFeeForm.setData(
                                                                'inspection_fee_note',
                                                                FEE_INCLUDED_NOTE_TEXT
                                                            );
                                                        }
                                                    }
                                                }}
                                            />
                                            <Label
                                                htmlFor="inspection_fee_included"
                                                className="text-xs font-normal leading-snug text-vw-grey"
                                            >
                                                Fee sudah termasuk di harga part & labour (fee
                                                di-set Rp 0)
                                            </Label>
                                        </div>

                                        <Textarea
                                            value={inspectionFeeForm.data.inspection_fee_note}
                                            onChange={(e) =>
                                                inspectionFeeForm.setData(
                                                    'inspection_fee_note',
                                                    e.target.value
                                                )
                                            }
                                            placeholder="Inspection fee note (optional)"
                                            rows={2}
                                            className="text-sm"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleInspectionFeeCancel}
                                                disabled={inspectionFeeForm.processing}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={inspectionFeeForm.processing}
                                            >
                                                {inspectionFeeForm.processing
                                                    ? 'Saving...'
                                                    : 'Save Fee'}
                                            </Button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1">
                                                <span className="text-vw-grey">Inspection Fee</span>
                                                {inspectionFeeEditable && (
                                                    <TextActionButton text="Edit" label="Edit inspection fee" onClick={() => setIsEditingFee(true)} />
                                                )}
                                            </div>
                                            <span className="text-gray-900">
                                                {formatCurrency(order.inspection_fee)}
                                            </span>
                                        </div>
                                        {order.inspection_fee_note && (
                                            <p className="text-xs text-vw-grey">
                                                {order.inspection_fee_note}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-between border-t border-vw-grey/15 pt-1 font-semibold text-gray-900">
                                    <span>Estimated Grand Total</span>
                                    <span>{formatCurrency(estimatedGrandTotalWithFee)}</span>
                                </div>
                            </div>

                            {/* Order Totals — baru muncul mulai Invoice Preparation
                                (bukan dari awal), tepat di bawah Estimated Grand
                                Total. Inspection Fee sudah tidak ditampilkan
                                sebagai baris di sini, tapi tetap masuk ke Grand
                                Total final. */}
                            {showPaymentSection && (
                                <>
                                    <Separator />
                                    <div className="space-y-1 text-sm">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                            Order Totals
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1">
                                                <span className="text-vw-grey">Confirmed Total</span>
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
                                            <span className="text-gray-900">
                                                {formatCurrency(grandTotalApproved)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-t border-vw-grey/15 pt-1 font-semibold text-gray-900">
                                            <div>
                                                <p>Grand Total</p>
                                                <p className="text-xs font-normal text-vw-grey">
                                                    Confirmed Total + Inspection Fee
                                                </p>
                                            </div>
                                            <span>{formatCurrency(finalGrandTotal)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                              </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Invoice & Payment — 1 card, muncul di bawah container
                    Inspection Items mulai quality_control. Bagian Payment
                    (dan Report to Cashier) baru muncul mulai
                    invoice_preparation; antar bagian dipisah hairline. */}
                {showInvoiceSection && (
                    <Panel title="Invoice & Payment">
                        {/* --- Invoice PDF: 1 baris. Kiri = file yang sudah
                            di-upload (+ ikon lihat & hapus), kanan = form upload. */}
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                1 · Invoice PDF
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                    {hasInvoice ? (
                                        <>
                                            <FileText className="h-4 w-4 shrink-0 text-vw-grey" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm text-gray-900">
                                                    Invoice uploaded
                                                </p>
                                                {invoice.uploaded_at && (
                                                    <p className="truncate text-xs text-vw-grey">
                                                        {formatDate(invoice.uploaded_at)}
                                                        {invoice.uploaded_by?.name &&
                                                            ` · ${invoice.uploaded_by.name}`}
                                                    </p>
                                                )}
                                            </div>
                                            <ViewButton className="text-xs" label="View invoice" onClick={() =>
        setPreviewFile({
            title: 'Invoice PDF',
            url: `/storage/${invoice.file_path}`,
        })
    }
/>
                                            <TextActionButton className="text-xs" text="Delete" label="Delete invoice" tone="danger" onClick={handleDeleteInvoice} />
                                        </>
                                    ) : (
                                        <p className="text-sm text-vw-grey">
                                            No invoice uploaded yet.
                                        </p>
                                    )}
                                </div>

                                <form
                                    onSubmit={handleInvoiceUpload}
                                    className="flex w-full items-center gap-2 sm:w-auto"
                                >
                                    <Input
                                        id="invoice_pdf"
                                        type="file"
                                        accept="application/pdf"
                                        aria-label={
                                            hasInvoice ? 'Replace invoice PDF' : 'Upload invoice PDF'
                                        }
                                        className="h-9 min-w-0 flex-1 text-xs sm:w-52 sm:flex-none"
                                        onChange={handleInvoiceFileChange}
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={
                                            invoiceForm.processing || !invoiceForm.data.invoice_pdf
                                        }
                                    >
                                        {invoiceForm.processing
                                            ? 'Uploading...'
                                            : hasInvoice
                                            ? 'Replace'
                                            : 'Upload'}
                                    </Button>
                                </form>
                            </div>
                            {invoiceForm.errors.invoice_pdf && (
                                <p className="text-xs text-urgent">{invoiceForm.errors.invoice_pdf}</p>
                            )}
                        </div>

                        {showPaymentSection && (
                            <>
                                <Separator />

                                {/* --- Payment --- */}
                                <div className="space-y-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                        2 · Payment &amp; Receipts
                                    </p>

                                    {/* Bank Accounts (kiri) sebaris dengan receipts (kanan).
                                        Di kanan: Customer Receipt di atas, Staff Receipt di
                                        bawah, dibatasi hairline. */}
                                    <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-vw-grey">Bank Accounts</p>
                                            <div className="space-y-1.5">
                                                {BANK_ACCOUNTS.map((acc) => (
                                                    <div key={acc.bank}>
                                                        <p className="text-xs font-semibold text-gray-900">
                                                            {acc.bank}
                                                        </p>
                                                        <p className="text-xs text-vw-grey">
                                                            {acc.account}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-vw-grey">Customer Receipt</p>
                                            {order.customer_payment_receipt ? (
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-4 w-4 shrink-0 text-vw-grey" />
                                                        <span className="text-sm text-gray-900">Receipt</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <ViewButton className="text-xs" label="View customer receipt" onClick={() =>
        setPreviewFile({
            title: 'Customer Receipt',
            url: `/storage/${order.customer_payment_receipt.file_path}`,
        })
    }
/>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-vw-grey">
                                                    Not uploaded by customer yet.
                                                </p>
                                            )}
                                        </div>

                                        <Separator />

                                        <div className="space-y-1.5">
                                            <p className="text-xs text-vw-grey">Staff Receipt</p>
                                            {order.staff_payment_receipt ? (
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-4 w-4 shrink-0 text-vw-grey" />
                                                        <span className="text-sm text-gray-900">Receipt</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <ViewButton className="text-xs" label="View staff receipt" onClick={() =>
        setPreviewFile({
            title: 'Staff Receipt',
            url: `/storage/${order.staff_payment_receipt.file_path}`,
        })
    }
/>
                                                        <TextActionButton className="text-xs" text="Delete" label="Delete staff receipt" tone="danger" onClick={handleDeleteStaffReceipt} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-vw-grey">
                                                    No receipt uploaded yet.
                                                </p>
                                            )}
                                            <form
                                                onSubmit={handleStaffReceiptUpload}
                                                className="grid grid-cols-4 items-center gap-2 pt-0.5"
                                            >
                                                <Input
                                                    type="file"
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    aria-label="Upload staff receipt"
                                                    className="col-span-3 h-9 min-w-0 text-xs"
                                                    onChange={handleStaffReceiptChange}
                                                />
                                                <Button
                                                    type="submit"
                                                    size="sm"
                                                    className="col-span-1 w-full whitespace-nowrap px-2 text-xs"
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
                                        </div>
                                        </div>
                                    </div>

                                    {/* Invoice Number + Bill To + Save. Kalau sudah tersimpan,
                                        tampil read-only dengan ikon pensil untuk edit. */}
                                    {showPaymentDetailsForm ? (
                                        <form
                                            onSubmit={handlePaymentDetailsSubmit}
                                            className="flex flex-wrap items-end gap-3"
                                        >
                                            <div className="min-w-[10rem] flex-1 space-y-1.5">
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
                                                {paymentDetailsForm.errors.invoice_number && (
                                                    <p className="text-xs text-urgent">
                                                        {paymentDetailsForm.errors.invoice_number}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="min-w-[10rem] flex-1 space-y-1.5">
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
                                                {paymentDetailsForm.errors.bill_to && (
                                                    <p className="text-xs text-urgent">
                                                        {paymentDetailsForm.errors.bill_to}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {hasPaymentDetails && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={handlePaymentDetailsCancel}
                                                        disabled={paymentDetailsForm.processing}
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                                <Button
                                                    type="submit"
                                                    size="sm"
                                                    disabled={paymentDetailsForm.processing}
                                                >
                                                    {paymentDetailsForm.processing ? 'Saving...' : 'Save'}
                                                </Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
                                                <div>
                                                    <p className="text-xs text-vw-grey">Invoice Number</p>
                                                    <p className="font-medium text-gray-900">
                                                        {order.invoice_number ?? '—'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-vw-grey">Bill To</p>
                                                    <p className="font-medium text-gray-900">
                                                        {order.bill_to ?? '—'}
                                                    </p>
                                                </div>
                                            </div>
                                            {canEditPayment && (
                                                <TextActionButton className="text-xs" text="Edit" label="Edit invoice details" onClick={() => setIsEditingPaymentDetails(true)} />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* --- Report to Cashier --- */}
                                {canEditPayment && (
                                    <>
                                        <Separator />
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-vw-grey">
                                                3 · Report to Cashier
                                            </p>

                                            {!canReportToCashier && (
                                                <p className="text-xs text-amber-700">
                                                    Fill in Invoice Number, Bill To, and upload at
                                                    least one receipt before reporting to cashier.
                                                </p>
                                            )}

                                            {/* Step by step: tiap langkah punya tombolnya sendiri. */}
                                            <ol className="space-y-2.5">
                                                <li className="flex items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vw-grey-light text-[11px] font-semibold text-vw-grey">
                                                            1
                                                        </span>
                                                        <span className="text-sm text-gray-900">
                                                            Download the receipt
                                                        </span>
                                                    </div>
                                                    <div className="w-48 shrink-0">
                                                        {order.customer_payment_receipt ||
                                                        order.staff_payment_receipt ? (
                                                            <a
                                                                href={`/storage/${
                                                                    (
                                                                        order.staff_payment_receipt ??
                                                                        order.customer_payment_receipt
                                                                    ).file_path
                                                                }`}
                                                                download
                                                                className="block w-full whitespace-nowrap rounded-md border border-vw-grey px-3 py-1.5 text-center text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                                            >
                                                                Download Receipt
                                                            </a>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="w-full whitespace-nowrap text-xs"
                                                                disabled
                                                            >
                                                                Download Receipt
                                                            </Button>
                                                        )}
                                                    </div>
                                                </li>
                                                <li className="flex items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vw-grey-light text-[11px] font-semibold text-vw-grey">
                                                            2
                                                        </span>
                                                        <span className="text-sm text-gray-900">
                                                            Copy the message
                                                        </span>
                                                    </div>
                                                    <div className="w-48 shrink-0">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full whitespace-nowrap text-xs"
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
                                                    </div>
                                                </li>
                                                <li className="flex items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vw-grey-light text-[11px] font-semibold text-vw-grey">
                                                            3
                                                        </span>
                                                        <span className="text-sm text-gray-900">
                                                            Open the group, paste the message, and attach the receipt manually
                                                        </span>
                                                    </div>
                                                    <div className="w-48 shrink-0">
                                                        {canReportToCashier ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    window.open(
                                                                        CASHIER_WA_GROUP_URL,
                                                                        'wa_cashier_tab'
                                                                    )
                                                                }
                                                                className="block w-full whitespace-nowrap rounded-md bg-vw-blue px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-vw-blue/90"
                                                            >
                                                                Open Cashier WA Group
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled
                                                                className="block w-full cursor-not-allowed whitespace-nowrap rounded-md bg-vw-grey/40 px-3 py-1.5 text-center text-xs font-semibold text-white"
                                                            >
                                                                Open Cashier WA Group
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            </ol>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </Panel>
                )}
                </div>
            </div>

            {/* Inspection Video Dialog — video hanya di-mount saat dialog
                terbuka, jadi otomatis berhenti diputar begitu ditutup. */}
            <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Inspection Video</DialogTitle>
                    </DialogHeader>
                    {video &&
                        (videoEmbedUrl ? (
                            <div className="aspect-video overflow-hidden rounded-md">
                                <iframe
                                    src={videoEmbedUrl}
                                    title="Inspection video"
                                    className="h-full w-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        ) : (
                            <video
                                src={video.video_url}
                                controls
                                autoPlay
                                className="aspect-video w-full rounded-md bg-black"
                            />
                        ))}
                </DialogContent>
            </Dialog>

            {/* Upload/Replace Video Dialog — dipakai baik untuk mengisi video
                pertama kali (order belum punya video) maupun mengganti video
                yang rusak/hilang secara fisik (kasus migrasi http->https,
                lihat PROJECT-RULES.md). Tidak digate status order. */}
            <Dialog
                open={videoUploadOpen}
                onOpenChange={(open) => !open && closeVideoUploadDialog()}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{video ? 'Replace Video' : 'Upload Video'}</DialogTitle>
                    </DialogHeader>

                    {video && (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle className="text-sm">This order already has a video</AlertTitle>
                            <AlertDescription className="text-xs">
                                Uploading a new file/link here will replace the existing video.
                                The old file (if any) will be removed after the new one is saved
                                successfully.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Video File</Label>
                            <Input
                                type="file"
                                accept="video/mp4,video/quicktime,video/webm"
                                onChange={(e) =>
                                    videoUploadForm.setData('file', e.target.files?.[0] ?? null)
                                }
                            />
                            <p className="text-xs text-vw-grey">Max 100MB, max 2 minutes duration.</p>
                            {videoUploadForm.errors.file && (
                                <p className="text-xs text-destructive">{videoUploadForm.errors.file}</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeVideoUploadDialog}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleVideoUploadSubmit}
                            disabled={videoUploadForm.processing || !videoUploadForm.data.file}
                        >
                            {videoUploadForm.processing ? 'Uploading...' : 'Save Video'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview File Dialog — receipt, invoice & estimation form dibuka di sini (bukan tab baru).
                PDF lewat viewer bawaan browser (panel thumbnail kiri disembunyikan lewat
                fragment URL `#navpanes=0`, lebar halaman pas dengan dialog), gambar
                lewat <img>. Link "Open
                in new tab" jadi cadangan (mis. browser mobile yang hanya
                menampilkan halaman pertama PDF di dalam iframe). */}
            <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{previewFile?.title}</DialogTitle>
                    </DialogHeader>
                    {previewFile &&
                        (isImageFile(previewFile.url) ? (
                            <img
                                src={previewFile.url}
                                alt={previewFile.title}
                                className="max-h-[75vh] w-full rounded-md object-contain"
                            />
                        ) : (
                            <iframe
                                src={`${previewFile.url}#navpanes=0&pagemode=none&view=FitH`}
                                title={previewFile.title}
                                className="h-[75vh] w-full rounded-md border border-vw-grey/15"
                            />
                        ))}
                    <DialogFooter>
                        {previewFile && (
                            <a
                                href={previewFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-sm text-blue-600 underline"
                            >
                                Open in new tab
                            </a>
                        )}
                        <Button type="button" variant="outline" onClick={() => setPreviewFile(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Item Dialog — read-only, tersedia untuk semua item apapun
                statusnya (termasuk approved). */}
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

            {/* Add Item Dialog — dipicu dari tombol "Add Item" di header
                container Inspection Items. Group dipilih di dalam dialog
                (default: tab yang sedang aktif). */}
            <Dialog
                open={!!addDialogGroup}
                onOpenChange={(open) => !open && closeAddItemDialog()}
            >
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add Item</DialogTitle>
                    </DialogHeader>
                    <ItemFormFields
                        data={addItemForm.data}
                        errors={addItemForm.errors}
                        groups={GROUPS}
                        onChange={(field, value) => addItemForm.setData(field, value)}
                    />
                    <p className="text-xs text-vw-grey">
                        Item Name, Labour Price, Part Price, and Group are required. Description is
                        optional.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeAddItemDialog}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleAddItemSubmit}
                            disabled={addItemForm.processing || !isItemComplete(addItemForm.data)}
                        >
                            {addItemForm.processing ? 'Saving...' : 'Add Item'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Item Dialog — cuma dipicu untuk item yang belum rejected
                (lihat guard di ItemReceiptRow). */}
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
                        groups={GROUPS}
                        onChange={(field, value) => editItemForm.setData(field, value)}
                    />
                    <p className="text-xs text-vw-grey">
                        Item Name, Labour Price, Part Price, and Group are required. Description is
                        optional.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeEditItemDialog}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleEditItemSubmit}
                            disabled={editItemForm.processing || !isItemComplete(editItemForm.data)}
                        >
                            {editItemForm.processing ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Satu AlertDialog generik untuk semua aksi destruktif/berisiko di
                halaman ini (delete item/invoice/estimation doc/receipt/order,
                reopen item, ubah status, revert status). */}
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