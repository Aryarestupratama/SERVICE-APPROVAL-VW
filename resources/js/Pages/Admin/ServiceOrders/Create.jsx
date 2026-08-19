import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, Head } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Badge } from '@/Components/ui/badge';
import { Separator } from '@/Components/ui/separator';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
} from '@/Components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/Components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/Components/ui/command';
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
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group';
import { Checkbox } from '@/Components/ui/checkbox';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/Components/ui/hover-card';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/Components/ui/dialog';
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
import { Alert, AlertTitle, AlertDescription } from '@/Components/ui/alert';
import {
    Check,
    ChevronsUpDown,
    Plus,
    Trash2,
    Pencil,
    Info,
    ArrowLeft,
    ArrowRight,
    FileVideo,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Tombol icon kecil (edit/delete/remove) yang selalu dibungkus Tooltip —
// dipakai berulang di beberapa tempat (baris item, card video, review),
// jadi disatukan di sini supaya konsisten & tidak duplikasi markup Tooltip.
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

// Penanda field wajib diisi — dipakai konsisten di sebelah semua Label yang
// wajib (Work Order Number, Customer, Vehicle, Customer Complaint, Chief
// Technician, Personal Message, Video, Item Name, Labour/Part Price, Fee
// Amount). Field yang tidak pakai komponen ini dianggap opsional.
function RequiredMark() {
    return (
        <span className="ml-0.5 text-urgent" aria-hidden="true">
            *
        </span>
    );
}

function EntityCombobox({ items, value, onSelect, placeholder, getLabel, getSubLabel }) {
    const [open, setOpen] = useState(false);
    const selected = items.find((item) => item.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selected ? getLabel(selected) : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {items.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${getLabel(item)} ${getSubLabel?.(item) ?? ''}`}
                                    onSelect={() => {
                                        onSelect(item.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            value === item.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <div>
                                        <p>{getLabel(item)}</p>
                                        {getSubLabel && (
                                            <p className="text-xs text-vw-grey">{getSubLabel(item)}</p>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// Input harga dengan pemisah ribuan real-time (mis. 10.000.000) supaya SA
// tidak salah hitung jumlah nol. Nilai yang dikirim ke form state tetap angka
// murni tanpa titik (string of digits) — kompatibel langsung dengan validasi
// backend 'numeric' (lihat ServiceOrderController::store()).
function CurrencyInput({ id, value, onChange, placeholder, disabled }) {
    const formatDisplay = (val) => {
        const digits = String(val ?? '').replace(/\D/g, '');
        if (digits === '') return '';
        return new Intl.NumberFormat('id-ID').format(Number(digits));
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

// Format angka jadi Rupiah untuk tampilan ringkasan (bukan input).
function formatIDR(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

// Ubah 'related' -> 'Related', 'work_in_progress' -> 'Work In Progress', dst.
function formatGroupLabel(group) {
    return group
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Subtotal per item SEBELUM PPN — tampilan saja. final_price_snapshot
// (dengan PPN) tetap dihitung & dikunci di backend saat item di-approve.
function itemSubtotal(item) {
    const costItem = Number(item.cost_item) || 0;
    const costLabour = Number(item.cost_labour) || 0;
    const discItem = Number(item.discount_item_percent) || 0;
    const discLabour = Number(item.discount_labour_percent) || 0;

    const netItem = costItem * (1 - discItem / 100);
    const netLabour = costLabour * (1 - discLabour / 100);

    return netItem + netLabour;
}

// Batas durasi video — konsisten dengan backend App\Rules\MaxVideoDuration
// (PROJECT-RULES.md bagian 9.4). Ini validasi UX (cepat, di sisi client) —
// backend tetap jadi sumber kebenaran validasi sebenarnya lewat getID3.
const MAX_VIDEO_DURATION_SECONDS = 120;

// Baca durasi video (detik) dari sebuah File lewat elemen <video> sementara.
// Return Promise<number> — reject kalau metadata tidak bisa dibaca (file
// corrupt/bukan video valid).
function readVideoDurationSeconds(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const videoEl = document.createElement('video');
        videoEl.preload = 'metadata';

        videoEl.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(videoEl.duration);
        };
        videoEl.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read video metadata.'));
        };

        videoEl.src = url;
    });
}

const emptyItemDraft = (defaultGroup) => ({
    name: '',
    description: '',
    cost_item: '',
    cost_labour: '',
    discount_item_percent: '',
    discount_labour_percent: '',
    group: defaultGroup ?? '',
});

// Field-field yang WAJIB diisi untuk sebuah item (semua kecuali description).
// Dipakai bareng oleh validasi frontend (isItemComplete/validateStep) supaya
// satu sumber kebenaran, tidak didefinisikan ulang di beberapa tempat.
const REQUIRED_ITEM_FIELDS = [
    'name',
    'cost_item',
    'cost_labour',
    'group',
];

// Cek satu item sudah lengkap (semua field wajib terisi, description boleh
// kosong). Dipakai untuk enable/disable tombol Save di dialog Add/Edit Item,
// dan untuk validasi per-item sebelum lanjut ke step berikutnya / submit.
function isItemComplete(item) {
    return REQUIRED_ITEM_FIELDS.every((field) => {
        const value = item?.[field];
        return value !== null && value !== undefined && String(value).trim() !== '';
    });
}

// Label field wajib dalam Bahasa yang enak dibaca user, dipakai untuk
// menyusun pesan "field X belum diisi" di validateStep & handleFormError.
const ITEM_FIELD_LABELS = {
    name: 'Item Name',
    cost_item: 'Part Price',
    cost_labour: 'Labour Price',
    discount_item_percent: 'Part Discount',
    discount_labour_percent: 'Labour Discount',
    group: 'Group',
};

// Cari field wajib pertama yang masih kosong pada sebuah item — dipakai
// untuk menyusun pesan error yang menyebut field & item mana yang bermasalah.
function firstMissingItemField(item) {
    return REQUIRED_ITEM_FIELDS.find((field) => {
        const value = item?.[field];
        return value === null || value === undefined || String(value).trim() === '';
    });
}

// Field set item — dipakai bareng untuk Dialog "Add Item" maupun Dialog
// "Edit Item", supaya layoutnya konsisten di kedua tempat. Semua field wajib
// diisi kecuali Description — ditandai dengan (optional) hanya pada label
// Description, sisanya dianggap wajib oleh SA.
function ItemFields({ item, groups, errors, errorPrefix, onChange }) {
    const err = (field) => (errorPrefix ? errors?.[`${errorPrefix}.${field}`] : null);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
                <Label>
                    Item Name
                    <RequiredMark />
                </Label>
                <Input
                    value={item.name}
                    onChange={(e) => onChange('name', e.target.value)}
                    placeholder="e.g. Brake pad replacement"
                />
                {err('name') && <p className="text-sm text-urgent">{err('name')}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label>Description (optional)</Label>
                <Textarea
                    value={item.description}
                    onChange={(e) => onChange('description', e.target.value)}
                    rows={2}
                />
            </div>

            <div className="space-y-1.5">
                <Label>
                    Labour Price
                    <RequiredMark />
                </Label>
                <CurrencyInput
                    value={item.cost_labour}
                    onChange={(v) => onChange('cost_labour', v)}
                    placeholder="0"
                />
                {err('cost_labour') && <p className="text-sm text-urgent">{err('cost_labour')}</p>}
            </div>
            <div className="space-y-1.5">
                <Label>
                    Part Price
                    <RequiredMark />
                </Label>
                <CurrencyInput
                    value={item.cost_item}
                    onChange={(v) => onChange('cost_item', v)}
                    placeholder="0"
                />
                {err('cost_item') && <p className="text-sm text-urgent">{err('cost_item')}</p>}
            </div>

            <div className="space-y-1.5">
                <Label>Labour Discount (%)</Label>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount_labour_percent}
                    onChange={(e) => onChange('discount_labour_percent', e.target.value)}
                    placeholder="0"
                />
                {err('discount_labour_percent') && (
                    <p className="text-sm text-urgent">{err('discount_labour_percent')}</p>
                )}
            </div>
            <div className="space-y-1.5">
                <Label>Part Discount (%)</Label>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount_item_percent}
                    onChange={(e) => onChange('discount_item_percent', e.target.value)}
                    placeholder="0"
                />
                {err('discount_item_percent') && (
                    <p className="text-sm text-urgent">{err('discount_item_percent')}</p>
                )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label>Group</Label>
                <Select value={item.group} onValueChange={(v) => onChange('group', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                        {groups.map((g) => (
                            <SelectItem key={g} value={g}>
                                {formatGroupLabel(g)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {err('group') && <p className="text-sm text-urgent">{err('group')}</p>}
            </div>
        </div>
    );
}

// Baris item di dalam Table per grup — kolom rapi (Name, Labour, Part,
// Discounts, Subtotal, Actions), lebih gampang di-scan dibanding flex row
// bebas sebelumnya. Edit membuka Dialog, Delete membuka AlertDialog konfirmasi.
// incomplete=true menandai baris dengan field wajib yang masih kosong
// (misalnya item lama sebelum field discount diwajibkan) — dikasih badge
// merah kecil supaya SA langsung tahu item mana yang perlu dilengkapi.
function ItemTableRow({ item, incomplete, onEdit, onDelete }) {
    return (
        <TableRow>
            <TableCell className="font-medium text-gray-900">
                <div className="flex items-center gap-2">
                    <span>{item.name || 'Untitled item'}</span>
                    {incomplete && (
                        <Badge
                            variant="outline"
                            className="border-urgent text-urgent text-[10px] font-normal"
                        >
                            Incomplete
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell className="text-vw-grey">{formatIDR(item.cost_labour)}</TableCell>
            <TableCell className="text-vw-grey">{formatIDR(item.cost_item)}</TableCell>
            <TableCell className="text-vw-grey">
                {Number(item.discount_labour_percent) > 0 || Number(item.discount_item_percent) > 0 ? (
                    <div className="flex flex-col gap-0.5 text-xs">
                        {Number(item.discount_labour_percent) > 0 && (
                            <span>Labour {item.discount_labour_percent}%</span>
                        )}
                        {Number(item.discount_item_percent) > 0 && (
                            <span>Part {item.discount_item_percent}%</span>
                        )}
                    </div>
                ) : (
                    '0%'
                )}
            </TableCell>
            <TableCell className="text-right font-semibold text-gray-900">
                {formatIDR(itemSubtotal(item))}
            </TableCell>
            <TableCell>
                <div className="flex items-center justify-end gap-3">
                    <IconActionButton icon={Pencil} label="Edit item" onClick={onEdit} />
                    <IconActionButton
                        icon={Trash2}
                        label="Delete item"
                        onClick={onDelete}
                        tone="danger"
                    />
                </div>
            </TableCell>
        </TableRow>
    );
}

// --- Multi-step config -----------------------------------------------------
const STEPS = [
    { id: 'details', label: 'Order & Assignment' },
    { id: 'items_fee', label: 'Items & Fee' },
    { id: 'review', label: 'Review & Submit' },
];

// Stepper header — numbered circle per step, dihubungkan garis, step yang
// sudah pernah dikunjungi bisa diklik langsung (SA mungkin perlu balik ganti
// sesuatu sebelum submit), step yang belum pernah dikunjungi di-disable
// supaya tidak "loncat" ke depan tanpa lewat validasi.
function Stepper({ steps, currentStep, maxVisitedStep, onStepClick }) {
    return (
        <div className="mb-6 flex items-center">
            {steps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                const isClickable = index <= maxVisitedStep;

                return (
                    <div key={step.id} className="flex flex-1 items-center last:flex-none">
                        <button
                            type="button"
                            disabled={!isClickable}
                            onClick={() => isClickable && onStepClick(index)}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <span
                                className={cn(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                                    isCurrent && 'bg-vw-blue text-white',
                                    isCompleted && !isCurrent && 'bg-vw-blue/15 text-vw-blue',
                                    !isCompleted && !isCurrent && 'bg-vw-grey-light text-vw-grey',
                                    isClickable && !isCurrent && 'cursor-pointer hover:opacity-80',
                                    !isClickable && 'cursor-not-allowed'
                                )}
                            >
                                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                            </span>
                            <span
                                className={cn(
                                    'hidden max-w-[7rem] text-center text-xs leading-tight sm:block',
                                    isCurrent ? 'font-semibold text-gray-900' : 'text-vw-grey'
                                )}
                            >
                                {step.label}
                            </span>
                        </button>
                        {index < steps.length - 1 && (
                            <div
                                className={cn(
                                    'mx-2 h-px flex-1',
                                    index < currentStep ? 'bg-vw-blue/40' : 'bg-vw-grey-light'
                                )}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Order Summary — card biasa di kolom kanan step Items & Fee.
function OrderSummaryCard({ itemCount, totalCost, feeAmount, estimatedTotal }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-vw-grey">Items</span>
                    <span>{itemCount}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-vw-grey">Items Subtotal</span>
                    <span>{formatIDR(totalCost)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-vw-grey">Inspection Fee</span>
                    <span>{formatIDR(feeAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-gray-900">
                    <span>Estimated Total</span>
                    <span>{formatIDR(estimatedTotal)}</span>
                </div>
                <p className="text-xs text-vw-grey">
                    Before tax. VAT and final per-item price are locked once the customer
                    approves each item.
                </p>
            </CardContent>
        </Card>
    );
}

// Navigasi Back/Next/Submit — dipakai di bawah konten (sekali di bawah tiap
// step), supaya SA selalu scroll ke bawah dulu untuk lanjut/submit dan tidak
// ada resiko klik ganda kena tombol yang berubah jadi Submit di posisi yang
// sama seperti waktu masih ditaruh di atas.
function StepNav({ currentStep, isLastStep, onBack, onNext, onSubmit, processing, submitDisabled }) {
    return (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={currentStep === 0}
            >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {isLastStep ? (
                // FIX (bug #1, round 2): tombol ini SENGAJA type="button", bukan
                // type="submit". Tombol type="submit" di dalam <form> bisa ke-trigger
                // oleh hal-hal di luar kontrol kita — tombol Enter di sebuah input
                // yang masih fokus, event IME/composition, atau race condition saat
                // React baru saja mengubah atribut type dari "button" ke "submit" di
                // titik yang sama persis dengan tombol Next sebelumnya. Dengan
                // type="button" + onClick manual, TIDAK ADA tombol submit asli di
                // DOM sama sekali, jadi tidak ada jalan bagi form untuk ter-submit
                // secara native/implisit. Satu-satunya cara order tersubmit adalah
                // klik eksplisit tombol ini.
                <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
                    {processing ? 'Creating...' : 'Create Service Order'}
                </Button>
            ) : (
                <Button type="button" onClick={onNext}>
                    Next <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            )}
        </div>
    );
}

export default function Create({ customers, vehicles, technicians, brands, groups }) {
    const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
    const [vehicleMode, setVehicleMode] = useState('existing');
    const [draft, setDraft] = useState(emptyItemDraft(groups?.[0]));

    // Error durasi video (frontend-only, terpisah dari `errors` Inertia yang
    // datang dari backend) + status lagi ngecek durasi (disable submit sebentar
    // supaya tidak submit sebelum hasil cek durasi selesai dibaca).
    const [videoDurationError, setVideoDurationError] = useState(null);
    const [checkingVideoDuration, setCheckingVideoDuration] = useState(false);

    // --- Step navigation state ---
    const [currentStep, setCurrentStep] = useState(0);
    const [maxVisitedStep, setMaxVisitedStep] = useState(0);
    // Pesan validasi step aktif (frontend-only), ditampilkan kalau SA klik
    // "Next" tapi field wajib di step itu belum lengkap.
    const [stepBlockMessage, setStepBlockMessage] = useState(null);

    // --- Add item dialog state ---
    const [addItemOpen, setAddItemOpen] = useState(false);

    // --- Item edit/delete dialog state ---
    const [editIndex, setEditIndex] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [deleteIndex, setDeleteIndex] = useState(null);

    // Checkbox "fee sudah termasuk di part & labour" — murni aksi UI, tidak
    // dikirim sebagai field terpisah ke backend (tidak ada kolom database
    // untuk ini, sengaja biar tidak nambah migration baru). Efeknya cuma:
    // set inspection_fee jadi 0 + isi inspection_fee_note dengan teks
    // default (SA masih bisa edit teksnya sebelum submit).
    const [feeIncludedChecked, setFeeIncludedChecked] = useState(false);
    const FEE_INCLUDED_NOTE_TEXT = 'Fee sudah termasuk di harga part & labour.';

    const { data, setData, post, processing, errors, clearErrors, transform } = useForm({
        work_order_number: '',
        customer_id: '',
        new_customer: { name: '', phone: '', email: '' },
        vehicle_id: '',
        new_vehicle: { plate_number: '', brand: '', vin: '', model: '' },
        technician_id: '',
        personal_message: '',
        inspection_fee: '',
        inspection_fee_note: '',
        customer_complaint: '',
        inspection_items: [],
        video: { video_source: 'upload', video_url: '', file: null },
    });

    useEffect(() => {
        setData('vehicle_id', '');
    }, [data.customer_id, customerMode]);

    const filteredVehicles =
        customerMode === 'existing' && data.customer_id
            ? vehicles.filter((v) =>
                (v.customers ?? []).some((c) => c.id === data.customer_id)
            )
            : [];

    transform((data) => ({
        ...data,
        customer_id: customerMode === 'existing' ? data.customer_id : '',
        new_customer: customerMode === 'new' ? data.new_customer : null,
        vehicle_id: vehicleMode === 'existing' ? data.vehicle_id : '',
        new_vehicle: vehicleMode === 'new' ? data.new_vehicle : null,
        inspection_items: data.inspection_items,
        videos: data.video.file ? [data.video] : [],
    }));

    const updateDraft = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

    // --- Add item (Dialog) ---
    const openAddItem = () => {
        setDraft(emptyItemDraft(groups?.[0]));
        setAddItemOpen(true);
    };

    const closeAddItem = () => setAddItemOpen(false);

    const saveAddItem = () => {
        if (!isItemComplete(draft)) return;
        setData('inspection_items', [...data.inspection_items, draft]);
        toast.success('Item added', { description: draft.name });
        setDraft(emptyItemDraft(groups?.[0]));
        closeAddItem();
    };

    // --- Edit item (Dialog) ---
    const openEditItem = (index) => {
        setEditIndex(index);
        setEditDraft({ ...data.inspection_items[index] });
    };

    const closeEditItem = () => {
        setEditIndex(null);
        setEditDraft(null);
    };

    const saveEditItem = () => {
        if (!isItemComplete(editDraft)) return;
        const items = [...data.inspection_items];
        items[editIndex] = editDraft;
        setData('inspection_items', items);
        toast.success('Item updated', { description: editDraft.name });
        closeEditItem();
    };

    // --- Delete item (AlertDialog) ---
    const openDeleteItem = (index) => setDeleteIndex(index);
    const closeDeleteItem = () => setDeleteIndex(null);

    const confirmDeleteItem = () => {
        const removedName = data.inspection_items[deleteIndex]?.name;
        setData(
            'inspection_items',
            data.inspection_items.filter((_, i) => i !== deleteIndex)
        );
        toast.success('Item removed', { description: removedName });
        closeDeleteItem();
    };

    const updateVideo = (field, value) => {
        setData('video', { ...data.video, [field]: value });
    };

    const itemsByGroup = useMemo(() => {
        const map = {};
        data.inspection_items.forEach((item, index) => {
            const g = item.group || 'ungrouped';
            if (!map[g]) map[g] = [];
            map[g].push({ item, index });
        });
        return map;
    }, [data.inspection_items]);

    const totalCost = data.inspection_items.reduce(
        (sum, item) => sum + itemSubtotal(item),
        0
    );
    const feeAmount = Number(data.inspection_fee) || 0;
    const estimatedTotal = totalCost + feeAmount;

    // --- Per-step validation (frontend-only, UX guard) --------------------
    // Return value: null kalau step valid, atau { message, itemIndex? } yang
    // berisi pesan yang harus ditampilkan dan (kalau ada) index item yang
    // bermasalah supaya bisa dibuka otomatis di dialog Edit.
    function validateStep(index) {
        switch (STEPS[index].id) {
            case 'details': {
                if (!data.work_order_number.trim()) {
                    return { message: 'Please fill in the Work Order Number.' };
                }
                if (customerMode === 'existing' && !data.customer_id) {
                    return { message: 'Please select a customer, or switch to "New" to add one.' };
                }
                if (
                    customerMode === 'new' &&
                    (!data.new_customer.name.trim() || !data.new_customer.phone.trim())
                ) {
                    return { message: 'Please fill in the new customer\'s name and phone number.' };
                }
                if (vehicleMode === 'existing' && !data.vehicle_id) {
                    return { message: 'Please select a vehicle, or switch to "New" to add one.' };
                }
                if (vehicleMode === 'new') {
                    const { plate_number, brand, vin, model } = data.new_vehicle;
                    if (!plate_number.trim() || !brand.trim() || !vin.trim() || !model.trim()) {
                        return { message: 'Please fill in all new vehicle fields (plate number, brand, VIN, model).' };
                    }
                }
                return null;
            }
            case 'items_fee': {
                if (data.inspection_items.length === 0) {
                    return { message: 'Please add at least one inspection item before continuing.' };
                }
                // Cek tiap item: semua field wajib (semua kecuali description)
                // harus terisi. Kalau ada yang belum lengkap, tunjuk item &
                // field mana persisnya supaya SA tidak perlu menebak.
                for (let i = 0; i < data.inspection_items.length; i++) {
                    const item = data.inspection_items[i];
                    const missingField = firstMissingItemField(item);
                    if (missingField) {
                        const itemLabel = item.name?.trim() || `Item #${i + 1}`;
                        return {
                            message: `"${itemLabel}" is missing "${ITEM_FIELD_LABELS[missingField]}". Please complete it before continuing.`,
                            itemIndex: i,
                        };
                    }
                }
                return null;
            }
            default:
                return null;
        }
    }

    const goToStep = (index) => {
        setStepBlockMessage(null);
        setCurrentStep(index);
    };

    const handleNext = () => {
        const blockResult = validateStep(currentStep);
        if (blockResult) {
            setStepBlockMessage(blockResult.message);
            if (typeof blockResult.itemIndex === 'number') {
                openEditItem(blockResult.itemIndex);
            }
            return;
        }
        const next = Math.min(currentStep + 1, STEPS.length - 1);
        setMaxVisitedStep((prev) => Math.max(prev, next));
        goToStep(next);
    };

    const handleBack = () => {
        goToStep(Math.max(currentStep - 1, 0));
    };

    // FIX (bug #1, round 2): logika submit sekarang dipanggil LANGSUNG dari
    // onClick tombol "Create Service Order" (type="button"), bukan lewat
    // event `submit` native dari <form>. Ini sengaja dipisah dari
    // `<form onSubmit>` supaya tidak ada jalur native sama sekali yang bisa
    // memicu submit tanpa klik eksplisit di tombol ini (lihat komentar di
    // StepNav). `<form>` tetap dipakai untuk struktur/aksesibilitas, tapi
    // `onFormSubmit` di bawah hanya jadi jaring pengaman terakhir kalau
    // browser tetap memicu native submit lewat jalur lain — dan jaring itu
    // pun tidak akan pernah benar-benar POST kecuali sudah di step Review.
    const submitOrder = () => {
        // Submit HANYA diproses kalau SA memang sedang berada di step
        // terakhir (Review). Kalau belum, ini dianggap tidak melakukan
        // apa-apa (tombol ini memang cuma dirender saat isLastStep true,
        // tapi dicek ulang di sini untuk jaga-jaga).
        if (currentStep !== STEPS.length - 1) {
            return;
        }

        // Safety net — cek ulang semua step wajib sebelum benar-benar
        // submit, kalau-kalau SA sampai ke Review lewat klik langsung ke
        // step number tanpa pernah "Next".
        for (let i = 0; i < STEPS.length - 1; i++) {
            const blockResult = validateStep(i);
            if (blockResult) {
                setStepBlockMessage(blockResult.message);
                goToStep(i);
                if (typeof blockResult.itemIndex === 'number') {
                    openEditItem(blockResult.itemIndex);
                }
                return;
            }
        }

        clearErrors();

        post(route('admin.service-orders.store'), {
            forceFormData: true, // wajib true karena ada kemungkinan file video
            onError: (freshErrors) => {
                handleSubmitErrors(freshErrors);
            },
        });
    };

    // Susun toast error yang SPESIFIK menyebut field & (kalau berlaku) item
    // mana yang bermasalah, alih-alih pesan generik "check the form". Kalau
    // errornya soal salah satu inspection_items.N.field, langsung buka
    // dialog Edit Item untuk item tersebut supaya SA tidak perlu mencari
    // sendiri di antara semua item.
    const handleSubmitErrors = (freshErrors) => {
        const errorKeys = Object.keys(freshErrors ?? {});

        if (errorKeys.length === 0) {
            toast.error('Please check the form for errors', {
                description: 'Some fields need your attention before this order can be created.',
            });
            return;
        }

        const itemErrorKey = errorKeys.find((key) => key.startsWith('inspection_items.'));

        if (itemErrorKey) {
            const match = itemErrorKey.match(/^inspection_items\.(\d+)\.(.+)$/);
            const itemIndex = match ? Number(match[1]) : null;
            const fieldKey = match ? match[2] : null;
            const fieldLabel = ITEM_FIELD_LABELS[fieldKey] ?? fieldKey;
            const itemLabel =
                (typeof itemIndex === 'number' && data.inspection_items[itemIndex]?.name?.trim()) ||
                (typeof itemIndex === 'number' ? `Item #${itemIndex + 1}` : 'an item');

            toast.error('Please check the form for errors', {
                description: `${itemLabel}: ${fieldLabel} — ${freshErrors[itemErrorKey]}`,
            });

            if (typeof itemIndex === 'number') {
                setCurrentStep(1);
                setMaxVisitedStep((prev) => Math.max(prev, 1));
                openEditItem(itemIndex);
            }
            return;
        }

        // Error di luar inspection_items (mis. work_order_number, vehicle,
        // dsb) — tunjukkan pesan yang sebenarnya, bukan cuma placeholder.
        const firstKey = errorKeys[0];
        toast.error('Please check the form for errors', {
            description: freshErrors[firstKey],
        });

        // Kalau errornya bukan dari step Items & Fee, kembalikan SA ke step
        // Order & Assignment supaya langsung terlihat field mana yang salah.
        setCurrentStep(0);
    };

    // Jaring pengaman terakhir kalau ada jalur native submit yang lolos
    // (misalnya Enter di sebuah input) — selalu dicegah, dan tidak pernah
    // langsung memanggil submitOrder dari sini. SA harus klik tombol
    // "Create Service Order" secara eksplisit.
    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (currentStep !== STEPS.length - 1) {
            handleNext();
        }
    };

    const isLastStep = currentStep === STEPS.length - 1;
    const currentStepId = STEPS[currentStep].id;

    return (
        <TooltipProvider delayDuration={200}>
        <AdminLayout title="New Service Order">
            <Head title="New Service Order" />

            <Stepper
                steps={STEPS}
                currentStep={currentStep}
                maxVisitedStep={maxVisitedStep}
                onStepClick={goToStep}
            />

            {stepBlockMessage && (
                <p className="mb-4 text-sm text-urgent">{stepBlockMessage}</p>
            )}

            <form id="service-order-form" onSubmit={handleFormSubmit}>
                <div className="space-y-6">
                    {currentStepId === 'details' && (
                        <>
                            {/* Work Order Number ditaruh sebagai strip ringkas di atas,
                                bukan card penuh — cuma 1 field, tidak perlu makan
                                seluruh lebar card seperti sebelumnya. */}
                            <Card>
                                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="w-full max-w-sm space-y-1.5">
                                        <Label>
                                            Work Order Number
                                            <RequiredMark />
                                        </Label>
                                        <Input
                                            value={data.work_order_number}
                                            onChange={(e) =>
                                                setData('work_order_number', e.target.value)
                                            }
                                            placeholder="e.g. WO-2026-0001"
                                        />
                                        {errors.work_order_number && (
                                            <p className="text-sm text-urgent">
                                                {errors.work_order_number}
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Customer & Vehicle berdampingan — keduanya "siapa & apa"
                                dari order ini, ukurannya sepadan jadi wajar disandingkan. */}
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            Customer
                                            <RequiredMark />
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <RadioGroup
                                            value={customerMode}
                                            onValueChange={setCustomerMode}
                                            className="grid grid-cols-2 gap-2"
                                        >
                                            <Label
                                                htmlFor="customer-mode-existing"
                                                className={cn(
                                                    'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                                                    customerMode === 'existing'
                                                        ? 'border-vw-blue bg-vw-blue text-white'
                                                        : 'border-vw-grey/30 text-gray-700 hover:bg-vw-grey-light/40'
                                                )}
                                            >
                                                <RadioGroupItem
                                                    value="existing"
                                                    id="customer-mode-existing"
                                                    className="sr-only"
                                                />
                                                Existing
                                            </Label>
                                            <Label
                                                htmlFor="customer-mode-new"
                                                className={cn(
                                                    'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                                                    customerMode === 'new'
                                                        ? 'border-vw-blue bg-vw-blue text-white'
                                                        : 'border-vw-grey/30 text-gray-700 hover:bg-vw-grey-light/40'
                                                )}
                                            >
                                                <RadioGroupItem
                                                    value="new"
                                                    id="customer-mode-new"
                                                    className="sr-only"
                                                />
                                                <Plus className="h-4 w-4" /> New
                                            </Label>
                                        </RadioGroup>

                                        {customerMode === 'existing' ? (
                                            <div className="space-y-1.5">
                                                <Label>
                                                    Select Customer
                                                    <RequiredMark />
                                                </Label>
                                                <EntityCombobox
                                                    items={customers}
                                                    value={data.customer_id}
                                                    onSelect={(id) => setData('customer_id', id)}
                                                    placeholder="Search customer..."
                                                    getLabel={(c) => c.name}
                                                    getSubLabel={(c) => c.phone}
                                                />
                                                {errors.customer_id && (
                                                    <p className="text-sm text-urgent">
                                                        {errors.customer_id}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        Name
                                                        <RequiredMark />
                                                    </Label>
                                                    <Input
                                                        value={data.new_customer.name}
                                                        onChange={(e) =>
                                                            setData('new_customer', {
                                                                ...data.new_customer,
                                                                name: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    {errors['new_customer.name'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_customer.name']}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        Phone
                                                        <RequiredMark />
                                                    </Label>
                                                    <Input
                                                        value={data.new_customer.phone}
                                                        onChange={(e) =>
                                                            setData('new_customer', {
                                                                ...data.new_customer,
                                                                phone: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    {errors['new_customer.phone'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_customer.phone']}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Email (optional)</Label>
                                                    <Input
                                                        type="email"
                                                        value={data.new_customer.email}
                                                        onChange={(e) =>
                                                            setData('new_customer', {
                                                                ...data.new_customer,
                                                                email: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            Vehicle
                                            <RequiredMark />
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <RadioGroup
                                            value={vehicleMode}
                                            onValueChange={setVehicleMode}
                                            className="grid grid-cols-2 gap-2"
                                        >
                                            <Label
                                                htmlFor="vehicle-mode-existing"
                                                className={cn(
                                                    'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                                                    vehicleMode === 'existing'
                                                        ? 'border-vw-blue bg-vw-blue text-white'
                                                        : 'border-vw-grey/30 text-gray-700 hover:bg-vw-grey-light/40'
                                                )}
                                            >
                                                <RadioGroupItem
                                                    value="existing"
                                                    id="vehicle-mode-existing"
                                                    className="sr-only"
                                                />
                                                Existing
                                            </Label>
                                            <Label
                                                htmlFor="vehicle-mode-new"
                                                className={cn(
                                                    'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                                                    vehicleMode === 'new'
                                                        ? 'border-vw-blue bg-vw-blue text-white'
                                                        : 'border-vw-grey/30 text-gray-700 hover:bg-vw-grey-light/40'
                                                )}
                                            >
                                                <RadioGroupItem
                                                    value="new"
                                                    id="vehicle-mode-new"
                                                    className="sr-only"
                                                />
                                                <Plus className="h-4 w-4" /> New
                                            </Label>
                                        </RadioGroup>

                                        {vehicleMode === 'existing' ? (
                                            <div className="space-y-1.5">
                                                <Label>
                                                    Select Vehicle
                                                    <RequiredMark />
                                                </Label>
                                                {customerMode === 'new' ? (
                                                    <p className="text-sm text-vw-grey">
                                                        New customers don't have any vehicles yet — add
                                                        one below.
                                                    </p>
                                                ) : !data.customer_id ? (
                                                    <p className="text-sm text-vw-grey">
                                                        Select a customer first to see their vehicles.
                                                    </p>
                                                ) : filteredVehicles.length === 0 ? (
                                                    <p className="text-sm text-vw-grey">
                                                        This customer has no vehicles yet — add one
                                                        below.
                                                    </p>
                                                ) : (
                                                    <EntityCombobox
                                                        items={filteredVehicles}
                                                        value={data.vehicle_id}
                                                        onSelect={(id) => setData('vehicle_id', id)}
                                                        placeholder="Search plate number..."
                                                        getLabel={(v) => v.plate_number}
                                                        getSubLabel={(v) => `${v.brand} ${v.model}`}
                                                    />
                                                )}
                                                {errors.vehicle_id && (
                                                    <p className="text-sm text-urgent">
                                                        {errors.vehicle_id}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        Plate Number
                                                        <RequiredMark />
                                                    </Label>
                                                    <Input
                                                        value={data.new_vehicle.plate_number}
                                                        onChange={(e) =>
                                                            setData('new_vehicle', {
                                                                ...data.new_vehicle,
                                                                plate_number: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    {errors['new_vehicle.plate_number'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_vehicle.plate_number']}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        Brand
                                                        <RequiredMark />
                                                    </Label>
                                                    <Select
                                                        value={data.new_vehicle.brand}
                                                        onValueChange={(value) =>
                                                            setData('new_vehicle', {
                                                                ...data.new_vehicle,
                                                                brand: value,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Brand" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {brands.map((brand) => (
                                                                <SelectItem key={brand} value={brand}>
                                                                    {brand}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {errors['new_vehicle.brand'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_vehicle.brand']}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        VIN/Chasis Number
                                                        <RequiredMark />
                                                    </Label>
                                                    <Input
                                                        value={data.new_vehicle.vin}
                                                        maxLength={17}
                                                        onChange={(e) =>
                                                            setData('new_vehicle', {
                                                                ...data.new_vehicle,
                                                                vin: e.target.value.toUpperCase(),
                                                            })
                                                        }
                                                        placeholder="17-character VIN/Chasis Number"
                                                    />
                                                    {errors['new_vehicle.vin'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_vehicle.vin']}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        Model
                                                        <RequiredMark />
                                                    </Label>
                                                    <Input
                                                        value={data.new_vehicle.model}
                                                        onChange={(e) =>
                                                            setData('new_vehicle', {
                                                                ...data.new_vehicle,
                                                                model: e.target.value,
                                                            })
                                                        }
                                                    />
                                                    {errors['new_vehicle.model'] && (
                                                        <p className="text-sm text-urgent">
                                                            {errors['new_vehicle.model']}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Customer Complaint & Assignment berdampingan */}
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Customer Complaint</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-1.5">
                                        <Label>
                                            Customer Complaint
                                            <RequiredMark />
                                        </Label>
                                        <Textarea
                                            value={data.customer_complaint}
                                            onChange={(e) =>
                                                setData('customer_complaint', e.target.value)
                                            }
                                            placeholder="What did the customer report/complain about their vehicle?"
                                            rows={5}
                                        />
                                        {errors.customer_complaint && (
                                            <p className="text-sm text-urgent">
                                                {errors.customer_complaint}
                                            </p>
                                        )}
                                        <p className="text-xs text-vw-grey">
                                            Still editable on the order page until it reaches Quality
                                            Control.
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Assignment & Message</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label>
                                                Chief Technician
                                                <RequiredMark />
                                            </Label>
                                            <Select
                                                value={data.technician_id ? String(data.technician_id) : ''}
                                                onValueChange={(value) => setData('technician_id', value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select chief technician" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {technicians.map((tech) => (
                                                        <SelectItem key={tech.id} value={String(tech.id)}>
                                                            {tech.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>
                                                Personal Message to Customer
                                                <RequiredMark />
                                            </Label>
                                            <Textarea
                                                value={data.personal_message}
                                                onChange={(e) =>
                                                    setData('personal_message', e.target.value)
                                                }
                                                placeholder="A short message shown alongside the video..."
                                                rows={3}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Video tetap full-width sendirian */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>
                                        Video
                                        <RequiredMark />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-4 lg:grid-cols-2 lg:items-start">
                                    <div className="space-y-3">
                                        {data.video.file && (
                                            <div className="flex items-center justify-between gap-2 rounded-md border border-vw-grey/20 bg-vw-grey-light/40 px-3 py-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <FileVideo className="h-4 w-4 shrink-0 text-vw-grey" />
                                                    <span className="truncate text-sm text-gray-900">
                                                        {data.video.file.name}
                                                    </span>
                                                </div>
                                                <IconActionButton
                                                    icon={X}
                                                    label="Remove video"
                                                    tone="danger"
                                                    onClick={() => {
                                                        updateVideo('file', null);
                                                        setVideoDurationError(null);
                                                    }}
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <Label>
                                                {data.video.file
                                                    ? 'Replace video file (max 2 minutes)'
                                                    : 'Video File (max 2 minutes)'}
                                                <RequiredMark />
                                            </Label>
                                            <Input
                                                type="file"
                                                accept="video/mp4,video/quicktime,video/webm"
                                                onChange={async (e) => {
                                                    const file = e.target.files[0];
                                                    setVideoDurationError(null);

                                                    if (!file) {
                                                        updateVideo('file', null);
                                                        return;
                                                    }

                                                    setCheckingVideoDuration(true);
                                                    try {
                                                        const duration = await readVideoDurationSeconds(
                                                            file
                                                        );
                                                        if (duration > MAX_VIDEO_DURATION_SECONDS) {
                                                            setVideoDurationError(
                                                                `Video is ${Math.round(
                                                                    duration
                                                                )}s long — maximum allowed is ${MAX_VIDEO_DURATION_SECONDS}s (2 minutes).`
                                                            );
                                                            updateVideo('file', null);
                                                            e.target.value = '';
                                                        } else {
                                                            updateVideo('file', file);
                                                        }
                                                    } catch {
                                                        setVideoDurationError(
                                                            'Could not read this video file. Please try a different file.'
                                                        );
                                                        updateVideo('file', null);
                                                        e.target.value = '';
                                                    } finally {
                                                        setCheckingVideoDuration(false);
                                                    }
                                                }}
                                            />
                                            {checkingVideoDuration && (
                                                <p className="text-xs text-vw-grey">
                                                    Checking video duration...
                                                </p>
                                            )}
                                            {videoDurationError && (
                                                <p className="text-sm text-urgent">
                                                    {videoDurationError}
                                                </p>
                                            )}
                                            {errors['videos.0.file'] && (
                                                <p className="text-sm text-urgent">
                                                    {errors['videos.0.file']}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <Alert>
                                        <Info className="h-4 w-4" />
                                        <AlertTitle className="text-sm">Only one video here</AlertTitle>
                                        <AlertDescription className="text-xs">
                                            Any additional videos will be sent directly to the
                                            customer's WhatsApp instead of being attached to this
                                            report.
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {currentStepId === 'items_fee' && (
                        <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
                            <div className="lg:col-span-2">
                                <Card className="flex h-full flex-col">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle>Inspection Items</CardTitle>
                                        <Button type="button" size="sm" onClick={openAddItem}>
                                            <Plus className="mr-1 h-4 w-4" /> Add Item
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="flex-1 space-y-4">
                                        {errors.inspection_items && (
                                            <p className="text-sm text-urgent">
                                                {errors.inspection_items}
                                            </p>
                                        )}

                                        {data.inspection_items.length === 0 ? (
                                            <div className="rounded-md border border-dashed border-vw-grey/40 py-10 text-center">
                                                <p className="text-sm text-vw-grey">
                                                    No items added yet.
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-3"
                                                    onClick={openAddItem}
                                                >
                                                    <Plus className="mr-1 h-4 w-4" /> Add your first item
                                                </Button>
                                            </div>
                                        ) : (
                                            <Tabs
                                                defaultValue={Object.keys(itemsByGroup)[0]}
                                                className="flex flex-1 flex-col"
                                            >
                                                <TabsList className="w-full justify-start overflow-x-auto">
                                                    {Object.keys(itemsByGroup).map((group) => (
                                                        <TabsTrigger key={group} value={group}>
                                                            {formatGroupLabel(group)}
                                                            <Badge variant="secondary" className="ml-1.5">
                                                                {itemsByGroup[group].length}
                                                            </Badge>
                                                        </TabsTrigger>
                                                    ))}
                                                </TabsList>
                                                {Object.entries(itemsByGroup).map(([group, entries]) => {
                                                    const subtotal = entries.reduce(
                                                        (sum, { item }) => sum + itemSubtotal(item),
                                                        0
                                                    );
                                                    return (
                                                        <TabsContent
                                                            key={group}
                                                            value={group}
                                                            className="mt-3 flex-1 space-y-3"
                                                        >
                                                            <div className="max-h-96 overflow-y-auto rounded-md border border-vw-grey/20">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Item</TableHead>
                                                                            <TableHead>Labour</TableHead>
                                                                            <TableHead>Part</TableHead>
                                                                            <TableHead>Discounts</TableHead>
                                                                            <TableHead className="text-right">
                                                                                Subtotal
                                                                            </TableHead>
                                                                            <TableHead className="w-16" />
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {entries.map(({ item, index }) => (
                                                                            <ItemTableRow
                                                                                key={index}
                                                                                item={item}
                                                                                incomplete={!isItemComplete(item)}
                                                                                onEdit={() => openEditItem(index)}
                                                                                onDelete={() =>
                                                                                    openDeleteItem(index)
                                                                                }
                                                                            />
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                            <div className="flex justify-end text-sm">
                                                                <span className="text-vw-grey">
                                                                    {formatGroupLabel(group)} subtotal:&nbsp;
                                                                </span>
                                                                <span className="font-semibold text-gray-900">
                                                                    {formatIDR(subtotal)}
                                                                </span>
                                                            </div>
                                                        </TabsContent>
                                                    );
                                                })}
                                            </Tabs>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="flex flex-col gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Inspection Fee</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label>
                                                Fee Amount
                                                <RequiredMark />
                                            </Label>
                                            <CurrencyInput
                                                value={data.inspection_fee}
                                                onChange={(v) => setData('inspection_fee', v)}
                                                placeholder="0"
                                                disabled={feeIncludedChecked}
                                            />
                                            <p className="text-xs text-vw-grey">
                                                If there is no fee, type 0.
                                            </p>
                                            {errors.inspection_fee && (
                                                <p className="text-sm text-urgent">
                                                    {errors.inspection_fee}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Checkbox
                                                id="inspection_fee_included"
                                                checked={feeIncludedChecked}
                                                onCheckedChange={(checked) => {
                                                    const isChecked = checked === true;
                                                    setFeeIncludedChecked(isChecked);
                                                    // Centang → paksa fee ke 0 & isi note
                                                    // default (masih bisa diedit manual),
                                                    // biar SA nggak bingung kenapa 0 padahal
                                                    // belum diketik apa-apa.
                                                    if (isChecked) {
                                                        setData('inspection_fee', '0');
                                                        if (!data.inspection_fee_note) {
                                                            setData(
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
                                        <div className="space-y-1.5">
                                            <Label>Fee Note (optional, reason for this fee)</Label>
                                            <Textarea
                                                value={data.inspection_fee_note}
                                                onChange={(e) =>
                                                    setData('inspection_fee_note', e.target.value)
                                                }
                                                rows={3}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>

                                <OrderSummaryCard
                                    itemCount={data.inspection_items.length}
                                    totalCost={totalCost}
                                    feeAmount={feeAmount}
                                    estimatedTotal={estimatedTotal}
                                />
                            </div>
                        </div>
                    )}

                    {currentStepId === 'review' && (
                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Order Details</CardTitle>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToStep(0)}
                                    >
                                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                                    <div>
                                        <p className="text-vw-grey">Work Order Number</p>
                                        <p className="font-medium text-gray-900">
                                            {data.work_order_number || '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-vw-grey">Customer</p>
                                        {(() => {
                                            if (customerMode !== 'existing') {
                                                return (
                                                    <p className="font-medium text-gray-900">
                                                        {data.new_customer.name || '—'} (new)
                                                    </p>
                                                );
                                            }
                                            const selectedCustomer = customers.find(
                                                (c) => c.id === data.customer_id
                                            );
                                            if (!selectedCustomer) {
                                                return <p className="font-medium text-gray-900">—</p>;
                                            }
                                            return (
                                                <HoverCard>
                                                    <HoverCardTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="font-medium text-gray-900 underline decoration-dotted underline-offset-2"
                                                        >
                                                            {selectedCustomer.name}
                                                        </button>
                                                    </HoverCardTrigger>
                                                    <HoverCardContent className="w-64 text-sm">
                                                        <p className="font-medium text-gray-900">
                                                            {selectedCustomer.name}
                                                        </p>
                                                        <p className="mt-1 text-vw-grey">
                                                            {selectedCustomer.phone || 'No phone on file'}
                                                        </p>
                                                        {selectedCustomer.email && (
                                                            <p className="text-vw-grey">
                                                                {selectedCustomer.email}
                                                            </p>
                                                        )}
                                                    </HoverCardContent>
                                                </HoverCard>
                                            );
                                        })()}
                                    </div>
                                    <div className="sm:col-span-2">
                                        <p className="text-vw-grey">Vehicle</p>
                                        {(() => {
                                            if (vehicleMode !== 'existing') {
                                                return (
                                                    <p className="font-medium text-gray-900">
                                                        {data.new_vehicle.plate_number || '—'} —{' '}
                                                        {data.new_vehicle.brand} {data.new_vehicle.model}{' '}
                                                        (new)
                                                    </p>
                                                );
                                            }
                                            const selectedVehicle = vehicles.find(
                                                (v) => v.id === data.vehicle_id
                                            );
                                            if (!selectedVehicle) {
                                                return <p className="font-medium text-gray-900">—</p>;
                                            }
                                            return (
                                                <HoverCard>
                                                    <HoverCardTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="font-medium text-gray-900 underline decoration-dotted underline-offset-2"
                                                        >
                                                            {selectedVehicle.plate_number} —{' '}
                                                            {selectedVehicle.brand} {selectedVehicle.model}
                                                        </button>
                                                    </HoverCardTrigger>
                                                    <HoverCardContent className="w-64 text-sm">
                                                        <p className="font-medium text-gray-900">
                                                            {selectedVehicle.plate_number}
                                                        </p>
                                                        <p className="mt-1 text-vw-grey">
                                                            {selectedVehicle.brand} {selectedVehicle.model}
                                                        </p>
                                                        {selectedVehicle.vin && (
                                                            <p className="text-vw-grey">
                                                                VIN: {selectedVehicle.vin}
                                                            </p>
                                                        )}
                                                    </HoverCardContent>
                                                </HoverCard>
                                            );
                                        })()}
                                    </div>
                                    {data.customer_complaint && (
                                        <div className="sm:col-span-2">
                                            <p className="text-vw-grey">Customer Complaint</p>
                                            <p className="text-gray-900">{data.customer_complaint}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Assignment & Video</CardTitle>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToStep(0)}
                                    >
                                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <div>
                                        <p className="text-vw-grey">Chief Technician</p>
                                        <p className="font-medium text-gray-900">
                                            {technicians.find(
                                                (t) => String(t.id) === String(data.technician_id)
                                            )?.name ?? 'Not assigned'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-vw-grey">Video</p>
                                        <p className="font-medium text-gray-900">
                                            {data.video.file
                                                ? data.video.file.name
                                                : 'No video attached'}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="lg:col-span-2">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>
                                        Items & Fee
                                        <Badge variant="secondary" className="ml-2">
                                            {data.inspection_items.length} item
                                            {data.inspection_items.length !== 1 && 's'}
                                        </Badge>
                                    </CardTitle>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => goToStep(1)}
                                    >
                                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid gap-6 lg:grid-cols-2">
                                    <div className="space-y-1.5">
                                        {data.inspection_items.length === 0 ? (
                                            <p className="text-sm text-vw-grey">No items added.</p>
                                        ) : (
                                            data.inspection_items.map((item, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between text-sm"
                                                >
                                                    <span className="text-gray-900">
                                                        {item.name || 'Untitled item'}
                                                    </span>
                                                    <span className="text-vw-grey">
                                                        {formatIDR(itemSubtotal(item))}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="space-y-2 border-t border-vw-grey/10 pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                                        <div className="flex justify-between">
                                            <span className="text-vw-grey">Items Subtotal</span>
                                            <span>{formatIDR(totalCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-vw-grey">Inspection Fee</span>
                                            <span className="font-medium text-gray-900">
                                                {formatIDR(feeAmount)}
                                            </span>
                                        </div>
                                        {data.inspection_fee_note && (
                                            <p className="text-xs text-vw-grey">
                                                {data.inspection_fee_note}
                                            </p>
                                        )}
                                        <Separator />
                                        <div className="flex justify-between font-semibold text-gray-900">
                                            <span>Estimated Total</span>
                                            <span>{formatIDR(estimatedTotal)}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>

                {/* Navigasi Back/Next/Submit dipindah ke bawah — sudah tidak
                    ada sidebar summary sticky yang perlu diberi ruang di atas,
                    dan menaruhnya di sini juga menghilangkan resiko klik ganda
                    kena tombol Submit yang muncul di posisi tombol Next
                    sebelumnya (lihat catatan di handleSubmit / bug #1). */}
                <StepNav
                    currentStep={currentStep}
                    isLastStep={isLastStep}
                    onBack={handleBack}
                    onNext={handleNext}
                    onSubmit={submitOrder}
                    processing={processing}
                    submitDisabled={processing || checkingVideoDuration || !!videoDurationError}
                />
            </form>

            {/* Dialog Add Item */}
            <Dialog open={addItemOpen} onOpenChange={(open) => !open && closeAddItem()}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add Item</DialogTitle>
                    </DialogHeader>
                    <ItemFields
                        item={draft}
                        groups={groups}
                        errors={errors}
                        errorPrefix={`inspection_items.${data.inspection_items.length}`}
                        onChange={updateDraft}
                    />
                    <p className="text-xs text-vw-grey">
                        Item Name, Labour Price, and Part Price are required. Description is optional.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeAddItem}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={saveAddItem} disabled={!isItemComplete(draft)}>
                            Add Item
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Edit Item */}
            <Dialog open={editIndex !== null} onOpenChange={(open) => !open && closeEditItem()}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Item</DialogTitle>
                    </DialogHeader>
                    {editDraft && (
                        <ItemFields
                            item={editDraft}
                            groups={groups}
                            errors={errors}
                            errorPrefix={`inspection_items.${editIndex}`}
                            onChange={(field, value) =>
                                setEditDraft((d) => ({ ...d, [field]: value }))
                            }
                        />
                    )}
                    <p className="text-xs text-vw-grey">
                        Item Name, Labour Price, and Part Price are required. Description is optional.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeEditItem}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={saveEditItem} disabled={!isItemComplete(editDraft)}>
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* AlertDialog konfirmasi Delete Item */}
            <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && closeDeleteItem()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{deleteIndex !== null ? data.inspection_items[deleteIndex]?.name : ''}"
                            will be removed from this order. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteItem}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
        </TooltipProvider>
    );
}