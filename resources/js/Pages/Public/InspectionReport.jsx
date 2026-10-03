import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Phone, Mail, MessageCircle, FileText, CheckCircle2, ExternalLink, Sparkles, MapPin, Globe, CalendarCheck, Wrench, ShieldCheck, Receipt, BadgeCheck, Check, X, Clock, Undo2, Tag, ClipboardCheck, Loader2, AlertTriangle, Droplets, Upload, ChevronRight, ChevronDown, ArrowDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/Components/ui/avatar';
import { Separator } from '@/Components/ui/separator';
import { Progress } from '@/Components/ui/progress';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/Components/ui/accordion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/Components/ui/sheet';
import { usePollLastActivity } from '@/hooks/usePollLastActivity';

// Viewer PDF/foto layar penuh — di-load lazy (beserta pdf.js) hanya saat customer
// membuka dokumen, supaya bundle halaman report tetap ringan.
const DocumentViewer = lazy(() => import('@/Components/DocumentViewer'));

// Backend publik kadang menolak lewat back()->with('error') (302, jadi masuk onSuccess).
// Helper ini menampilkan pesannya dan memberi tahu pemanggil agar tidak lanjut.
function flashFailed(page) {
    const message = page?.props?.flash?.error;
    if (!message) return false;
    toast.error(message);
    return true;
}

function StatusStamp({ status }) {
    const config = {
        pending: { label: 'Waiting', Icon: Clock, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
        approved: { label: 'Approved', Icon: Check, cls: 'bg-approved/10 text-approved ring-approved/25' },
        rejected: { label: 'Rejected', Icon: X, cls: 'bg-gray-100 text-gray-700 ring-gray-300' },
    }[status] ?? { label: status, Icon: Clock, cls: 'bg-vw-grey/10 text-vw-grey ring-vw-grey/25' };
    const { label, Icon, cls } = config;

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${cls}`}
        >
            <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            {label}
        </span>
    );
}

const GROUP_LABEL = {
    related: 'Related',
    safety: 'Safety',
    durability: 'Durability',
    experience: 'Experience',
    appearance: 'Appearance',
};

// Label pendek dipakai di stepper mode mobile (kriteria mobile-responsive
// TODO #2) supaya tidak sempit/tumpang tindih di layar sempit (~320-375px).
const STATUS_STEPS = [
    { key: 'appointment', label: 'Appointment', shortLabel: 'Appt', icon: CalendarCheck, description: 'Your appointment is confirmed. Please review the inspection results below.' },
    { key: 'work_in_progress', label: 'In Progress', shortLabel: 'Progress', icon: Wrench, description: 'Our technicians are working on your vehicle.' },
    { key: 'quality_control', label: 'Quality Control', shortLabel: 'QC', icon: ShieldCheck, description: 'Your vehicle is being checked and washed before handover.' },
    { key: 'invoice_preparation', label: 'Invoice', shortLabel: 'Invoice', icon: Receipt, description: 'Your invoice is ready. Please review it and proceed with payment.' },
    { key: 'completed', label: 'Completed', shortLabel: 'Done', icon: BadgeCheck, description: 'Your service is complete. Thank you for choosing us.' },
];

// CHANGED: estimation form sekarang tetap tampil saat quality_control juga,
// selaras dengan $showEstimationViewer di InspectionReportController::show().
const ESTIMATION_VISIBLE_STATUSES = ['work_in_progress', 'quality_control'];
// Harus sama dengan guard backend (InspectionReportController::submitDecisions): hanya work_in_progress.
const DECIDABLE_STATUSES = ['work_in_progress'];

// wa.me butuh format internasional tanpa 0/+ di depan: 0812… → 62812…
const toWaDigits = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    return d.startsWith('0') ? `62${d.slice(1)}` : d;
};
// Invoice baru terlihat oleh customer mulai status invoice_preparation —
// meskipun admin sudah bisa mulai upload invoice dari quality_control (lihat
// Admin/ServiceOrders/Show.jsx), customer belum perlu melihatnya sampai
// tahap ini karena QC masih proses cek & belum tentu harga sudah final.
const INVOICE_VISIBLE_STATUSES = ['invoice_preparation', 'completed'];
const FINAL_PRICING_STATUSES = ['quality_control', 'invoice_preparation', 'completed'];
const THANK_YOU_VISIBLE_STATUSES = ['completed'];

function itemDisplayPrice(item) {
    if (item.final_price_snapshot !== null && item.final_price_snapshot !== undefined) {
        return item.final_price_snapshot;
    }
    const itemAfterDiscount = item.cost_item * (1 - (item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount = item.cost_labour * (1 - (item.discount_labour_percent ?? 0) / 100);
    return itemAfterDiscount + labourAfterDiscount;
}

function itemSubtotal(item) {
    const itemAfterDiscount = item.cost_item * (1 - (item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount = item.cost_labour * (1 - (item.discount_labour_percent ?? 0) / 100);
    return itemAfterDiscount + labourAfterDiscount;
}

// Kontribusi 1 item ke Final Total — item 'rejected' dikecualikan (return
// null, sudah benar sebelumnya). Item yang sudah locked
// (final_price_snapshot terisi) TETAP pakai snapshot itu sebagai total
// (tidak pernah berubah), tapi subtotal & VAT-nya dipecah balik pakai
// vatPercent SAAT INI — valid selama tarif PPN belum pernah diganti sejak
// item itu di-lock. Kalau tarif PPN memang berubah di kemudian hari,
// breakdown Subtotal/VAT bisa sedikit meleset, TAPI Final Total tetap
// akurat karena tetap pakai angka snapshot asli.
function itemContribution(item, vatPercent) {
    if (item.status === 'rejected') return null;

    if (item.final_price_snapshot !== null && item.final_price_snapshot !== undefined) {
        const total = item.final_price_snapshot;
        const sub = total / (1 + vatPercent / 100);
        return { subtotal: sub, vat: total - sub, total };
    }

    const sub = itemSubtotal(item);
    const vat = sub * (vatPercent / 100);
    return { subtotal: sub, vat, total: sub + vat };
}

// Format rupiah: SELALU dibulatkan ke bilangan bulat. Sebelumnya toLocaleString()
// polos bisa memunculkan pecahan aneh (mis. "90.909,091") di baris Subtotal/VAT
// karena hasil pembagian snapshot / (1 + PPN).
function formatIDR(value) {
    return Math.round(Number(value) || 0).toLocaleString('id-ID');
}

// "Rp" dibuat kecil & redup, angkanya yang jadi fokus. Pakai font sans biasa +
// tabular-nums (lebar digit sama, jadi tetap rapi/sejajar) — bukan monospace lagi.
function Rupiah({ value, className = '' }) {
    return (
        <span className={`whitespace-nowrap tabular-nums ${className}`}>
            <span className="mr-0.5 text-[0.7em] font-medium opacity-60">Rp</span>
            {formatIDR(value)}
        </span>
    );
}

// Harga sebelum diskon (pre-VAT), dasar hitung total diskon.
function itemListPrice(item) {
    return Number(item.cost_item ?? 0) + Number(item.cost_labour ?? 0);
}

// Diskon per item (pre-VAT), dibulatkan. Selalu >= 0.
function itemDiscountAmount(item) {
    return Math.max(0, Math.round(itemListPrice(item) - itemSubtotal(item)));
}

// Format tanggal+jam singkat untuk info "uploaded at"; null kalau tidak valid.
function formatDateTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Judul section dokumen (Estimation / Invoice / Payment): teks + jumlah + garis tipis,
// gayanya disamakan dengan header grup di Inspection Items.
function SectionTitle({ children, count }) {
    return (
        <div className="flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">{children}</h2>
            {count > 1 && (
                <span className="rounded-full bg-vw-blue/10 px-2 py-0.5 text-[10px] font-bold text-vw-blue">{count}</span>
            )}
            <div className="h-px flex-1 bg-vw-grey/15" />
        </div>
    );
}

// Kartu dokumen (PDF estimation, invoice, bukti bayar). Klik/tap membuka viewer di dalam
// halaman (onOpen) — customer iPhone tidak perlu lagi pindah tab lalu cari tab lama.
// Tetap <a href target="_blank"> supaya long-press / klik-tengah / "open in new tab"
// masih berfungsi, dan tetap jalan kalau JS gagal.
function DocumentCard({ href, title, subtitle, onOpen }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
                if (!onOpen) return;
                e.preventDefault();
                onOpen({ url: href, title });
            }}
            className="group flex items-center gap-3 rounded-xl border border-vw-grey/15 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-vw-blue/40 hover:shadow-md"
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-vw-blue/10 text-vw-blue transition-colors group-hover:bg-vw-blue group-hover:text-white">
                <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{title}</span>
                <span className="block truncate text-xs text-vw-grey">{subtitle}</span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-vw-blue">
                <span className="hidden sm:inline">View</span>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </span>
        </a>
    );
}

// Placeholder "sedang disiapkan" — halaman ini polling otomatis, jadi dokumennya
// memang akan muncul sendiri tanpa perlu refresh.
function PendingNotice({ title, text }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-vw-grey/30 bg-vw-grey-light/40 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-vw-grey shadow-sm">
                <Clock className="h-5 w-5 motion-safe:animate-pulse" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-xs text-gray-600">{text}</p>
            </div>
        </div>
    );
}

// Deskripsi item: dipotong 2 baris (clamp) dengan toggle "Read more" / "Show less".
// Pakai -webkit-line-clamp lewat inline style (bukan class Tailwind line-clamp-2)
// supaya tidak tergantung plugin Tailwind yang mungkin belum terpasang.
// Threshold ~85 karakter dipakai sebagai perkiraan kasar 2 baris di lebar kartu
// mobile — kalau deskripsi lebih pendek dari itu, tombol toggle disembunyikan
// karena clamp 2 baris nyaris pasti tidak akan memotong apa pun.
const DESCRIPTION_CLAMP_THRESHOLD = 110;

function ItemDescription({ text }) {
    const [expanded, setExpanded] = useState(false);
    if (!text) return null;
    const isLong = text.length > DESCRIPTION_CLAMP_THRESHOLD;

    return (
        <div className="mt-0.5">
            <p
                className="text-sm leading-snug text-gray-600"
                style={
                    isLong && !expanded
                        ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                        : undefined
                }
            >
                {text}
            </p>
            {isLong && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-0.5 inline-flex min-h-[36px] items-center gap-0.5 text-xs font-semibold text-vw-blue"
                >
                    {expanded ? 'Show less' : 'Read more'}
                    <ChevronDown
                        className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            )}
        </div>
    );
}

// Kartu penuh — HANYA dipakai untuk item yang masih 'pending' (butuh keputusan
// sekarang). Dibuat lebih tipis dari versi sebelumnya (padding, ukuran teks,
// dan tombol dikecilkan) supaya daftar terasa lebih ringkas meski tetap mudah
// di-tap di mobile.
function InspectionItemCard({ item, canDecide, itemRef, onDecision, onUndoLocal }) {
    const discount = itemDiscountAmount(item);

    return (
        <li
            ref={itemRef}
            className="relative scroll-mt-24 overflow-hidden rounded-lg border border-vw-grey/15 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
            <span className="absolute inset-y-0 left-0 w-1 bg-vw-blue" aria-hidden="true" />

            <div className="p-3 pl-4 sm:p-3.5 sm:pl-5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug text-gray-900">{item.name}</p>
                        <ItemDescription text={item.description} />
                    </div>
                    <StatusStamp status={item.status} />
                </div>

                <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                    <div>
                        <Rupiah value={itemDisplayPrice(item)} className="block text-base font-bold text-gray-900" />
                        {discount > 0 && (
                            <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-approved/10 px-1.5 py-0.5 text-[10px] font-semibold text-approved">
                                <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                                Discount <Rupiah value={discount} />
                            </p>
                        )}
                    </div>

                    {canDecide && (
                        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                            <button
                                type="button"
                                aria-pressed={item.status === 'approved'}
                                onClick={() => (item.status === 'approved' ? onUndoLocal(item) : onDecision(item.id, 'approved'))}
                                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold transition active:scale-95 ${item.status === 'approved' ? 'bg-approved text-white shadow-sm ring-2 ring-approved/30' : 'border border-approved/60 bg-white text-approved hover:bg-approved/10'}`}
                            >
                                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                {item.status === 'approved' ? 'Approved · Undo' : 'Approve'}
                            </button>
                            <button
                                type="button"
                                aria-pressed={item.status === 'rejected'}
                                onClick={() => (item.status === 'rejected' ? onUndoLocal(item) : onDecision(item.id, 'rejected'))}
                                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold transition active:scale-95 ${item.status === 'rejected' ? 'bg-gray-700 text-white shadow-sm ring-2 ring-gray-700/30' : 'border border-gray-400 bg-white text-gray-700 hover:bg-gray-100'}`}
                            >
                                <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                {item.status === 'rejected' ? 'Rejected · Undo' : 'Reject'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

// Baris ringkas — dipakai untuk item yang SUDAH diputuskan (approved/rejected).
// Cuma 1 baris: ikon status, nama, harga (atau label "Rejected"), dan tombol
// "Cancel decision" kalau masih boleh dibatalkan. Ini yang bikin halaman
// memendek otomatis begitu customer memutuskan sesuatu.
function DecidedItemRow({ item, canCancel, onCancel }) {
    const isApproved = item.status === 'approved';

    return (
        <li className="flex items-center gap-2.5 rounded-lg border border-vw-grey/10 bg-vw-grey-light/40 px-3 py-0.5">
            <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isApproved ? 'bg-approved text-white' : 'bg-vw-grey/20 text-vw-grey'}`}
            >
                {isApproved ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isApproved ? 'text-gray-800' : 'text-gray-600 line-through decoration-1'}`}>
                {item.name}
            </span>
            {isApproved ? (
                <Rupiah value={itemDisplayPrice(item)} className="shrink-0 text-sm font-semibold text-gray-900" />
            ) : (
                <span className="shrink-0 text-xs font-medium text-gray-600">Rejected</span>
            )}
            {canCancel && (
                <button
                    type="button"
                    onClick={() => onCancel(item)}
                    className="ml-1 flex min-h-[44px] shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-gray-600 transition hover:bg-vw-blue/5 hover:text-vw-blue"
                >
                    <Undo2 className="h-3 w-3" aria-hidden="true" />
                    Change
                </button>
            )}
        </li>
    );
}

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

function initials(name) {
    if (!name) return '?';
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
}

export default function InspectionReport({
    token, settings, order, vehicle, customer, serviceAdvisor, chiefTechnician,
    videos, items: initialItems, invoice, estimationDocuments, customerPaymentReceipt
}) {
    const [items, setItems] = useState(initialItems);
    // BUG FIX: sebelumnya "keputusan lokal yang belum disubmit" dideteksi dengan
    // membandingkan `items[idx].status` vs `initialItems[idx].status` by INDEX.
    // Masalahnya: kalau admin reopen 1 item yang SUDAH disubmit sebelumnya
    // (server: approved → pending lagi), pola yang muncul di index itu SAMA
    // PERSIS dengan pola "customer baru approve, belum submit" (items[idx] non-pending,
    // initialItems[idx] pending) — padahal maksudnya kebalikan (server yang berubah,
    // bukan customer). Akibatnya effect sync di bawah salah kira ada keputusan lokal,
    // jadi berhenti sync SELAMANYA dan item yang di-reopen tidak pernah kembali
    // muncul sebagai pending di customer (cuma tombol Submit yang muncul).
    // Fix: lacak keputusan lokal secara EKSPLISIT per item id (bukan hasil diff),
    // diisi hanya lewat handleDecision/handleCancelDecision.
    const [localDecisions, setLocalDecisions] = useState(new Map());
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [receiptFile, setReceiptFile] = useState(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    // Pembatalan keputusan yang SUDAH disubmit ke server (item yang masih lokal
    // langsung di-undo tanpa konfirmasi, lihat handleCancelDecision).
    const [undoTarget, setUndoTarget] = useState(null);
    const [undoing, setUndoing] = useState(false);
    // Dokumen yang sedang dibuka di viewer layar penuh: { url, title } atau null.
    const [viewerDoc, setViewerDoc] = useState(null);
    // Ref tiap kartu item pending (dipakai chip "Jump to next") + cursor untuk
    // menyiklus urutan lompat kalau tombolnya ditekan berkali-kali.
    const pendingItemRefs = useRef({});
    const itemsSectionRef = useRef(null);
    const [jumpCursor, setJumpCursor] = useState(0);

    // Kriteria #5: cuma ada 1 video sekarang, tidak ada lagi tab/pilihan part.
    const video = videos?.[0] ?? null;
    const embedUrl = video ? youtubeEmbedUrl(video.video_url) : null;

    const canDecide = DECIDABLE_STATUSES.includes(order.status);
    const pendingItems = items.filter((item) => item.status === 'pending');
    const hasPendingItems = pendingItems.length > 0;
    const decidedItemsList = items.filter((item) => item.status !== 'pending');
    // Tanpa grouping: item yang masih menunggu keputusan selalu ditaruh di atas,
    // item yang sudah diputuskan menyusul di bawah dalam bentuk baris ringkas —
    // supaya yang tampil di layar selalu yang perlu diputuskan sekarang dulu.
    const serverStatusById = new Map(initialItems.map((i) => [i.id, i.status]));
    const isServerPending = (i) => (serverStatusById.get(i.id) ?? i.status) === 'pending';
    const orderedItems = [...items].sort((a, b) => Number(!isServerPending(a)) - Number(!isServerPending(b)));

    // Chip "Jump to next" — pengganti chip lompat-per-grup (grouping sengaja
    // tidak dipakai). Menyiklus ke item pending berikutnya tiap kali ditekan.
    const handleJumpToPending = () => {
        if (pendingItems.length === 0) return;
        const target = pendingItems[jumpCursor % pendingItems.length];
        const node = pendingItemRefs.current[target.id];
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setJumpCursor((c) => (c + 1) % pendingItems.length);
    };
    const isLocked = !canDecide || !hasPendingItems;

    // Keputusan lokal yang belum disubmit = item yang ID-nya tercatat di
    // localDecisions (diisi lewat handleDecision). TIDAK lagi hasil diff by index.
    const decidedThisRound = items.filter((item) => localDecisions.has(item.id));
    const hasDecisionToSubmit = decidedThisRound.length > 0;

    // Polling + change-detection (PROJECT-RULES.md bagian 12) — customer bisa
    // saja masih membuka tab ini sementara SA update status/upload dokumen di
    // admin. Setiap kali props `items` terbaru datang dari server, MERGE
    // per-item (bukan skip semua-atau-tidak-sama-sekali):
    // - Kalau item itu punya keputusan lokal (localDecisions) DAN server masih
    //   bilang item itu 'pending' → keputusan lokal customer belum kekejar
    //   server, pertahankan status lokalnya (jangan sampai hilang sebelum sempat
    //   ditekan Submit).
    // - Selain itu (tidak ada keputusan lokal, ATAU server sudah tidak lagi
    //   'pending' untuk item itu — misal admin reopen/approve dari sisi lain)
    //   → percaya sepenuhnya status dari server. Ini yang memperbaiki bug reopen:
    //   item yang di-reopen tidak punya entri di localDecisions (keputusan lama
    //   sudah kesubmit & sudah dibersihkan), jadi langsung ikut status server
    //   yang terbaru ('pending' lagi).
    useEffect(() => {
        setItems(
            initialItems.map((serverItem) => {
                const localStatus = localDecisions.get(serverItem.id);
                if (localStatus && serverItem.status === 'pending') {
                    return { ...serverItem, status: localStatus };
                }
                return serverItem;
            })
        );
    }, [initialItems, localDecisions]);

    usePollLastActivity({
        url: route('public.report.last-activity', token),
        initialValue: order.last_activity_at,
        only: ['order', 'items', 'invoice', 'estimationDocuments', 'customerPaymentReceipt'],
        intervalMs: 4000,
    });

    // Controller menolak lewat abort(409/410/422): bukan error validasi, jadi onError
    // tidak terpanggil dan Inertia akan menampilkan modal HTML error. Tangkap di sini.
    useEffect(() => {
        const messages = {
            410: 'This link has expired. Please contact the workshop for a new one.',
            409: 'This report has changed and can no longer be updated this way. We refreshed it for you.',
            422: 'Some items changed while you were deciding. We refreshed the list, please check and try again.',
            429: 'Too many attempts. Please wait a minute and try again.',
        };
        return router.on('invalid', (event) => {
            const status = event.detail.response?.status;
            if (!messages[status]) return;
            event.preventDefault();
            toast.error(messages[status]);
            if (status === 409 || status === 422) {
                router.reload({ only: ['order', 'items', 'invoice', 'estimationDocuments', 'customerPaymentReceipt'] });
            }
        });
    }, []);

    const vatPercent = Number(settings.ppn_percent ?? 0);
    const inspectionFee = Number(order.inspection_fee ?? 0);

    // CHANGED: item 'rejected' tetap dikecualikan (sudah benar sebelumnya).
    // Yang baru: item yang sudah locked (final_price_snapshot terisi) tetap
    // pakai snapshot sebagai Final Total (tidak pernah berubah), tapi
    // Subtotal/VAT-nya dipecah balik pakai vatPercent saat ini — valid
    // selama tarif PPN belum pernah diganti sejak item itu di-approve.
    // Lihat catatan di itemContribution() di atas.
    let subtotal = 0;
    let vatAmount = 0;
    let grandTotal = 0;
    let listTotal = 0; // harga sebelum diskon (pre-VAT), item rejected tidak dihitung

    for (const item of items) {
        const contribution = itemContribution(item, vatPercent);
        if (!contribution) continue; // item rejected, dilewati

        listTotal += itemListPrice(item);

        subtotal += contribution.subtotal;
        vatAmount += contribution.vat;
        grandTotal += contribution.total;
    }

    // Total diskon yang didapat customer = harga sebelum diskon - Subtotal, jadi
    // (Price before discount - Discount = Subtotal) selalu match di ringkasan.
    const totalDiscount = Math.max(0, Math.round(listTotal - subtotal));

    const decidedApprovedSubtotal = decidedThisRound
        .filter((item) => item.status === 'approved')
        .reduce((sum, item) => sum + itemSubtotal(item), 0);
    const decidedApprovedTotal = decidedApprovedSubtotal * (1 + vatPercent / 100);
    const decidedApprovedItems = decidedThisRound.filter((item) => item.status === 'approved');
    const decidedRejectedCount = decidedThisRound.length - decidedApprovedItems.length;
    const decidedListTotal = decidedApprovedItems.reduce((sum, item) => sum + itemListPrice(item), 0);
    const decidedDiscount = Math.max(0, Math.round(decidedListTotal - decidedApprovedSubtotal));

    const handleDecision = (itemId, decision) => {
        setLocalDecisions((prev) => new Map(prev).set(itemId, decision));
        setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, status: decision } : item)));
    };

    // Batalkan keputusan: boleh selama status order masih Appointment / Work In
    // Progress (= canDecide). Begitu masuk Quality Control, tombolnya hilang.
    // - Keputusan yang belum disubmit (masih lokal): langsung dikembalikan ke pending.
    // - Keputusan yang sudah tersimpan di server: minta konfirmasi, lalu POST ke
    //   endpoint baru `public.report.undo-decision` (lihat BACKEND-undo-decision.md).
    //   Tombolnya HANYA muncul kalau route itu sudah ada, supaya tidak error.
    let hasUndoRoute = false;
    try {
        hasUndoRoute = route().has('public.report.undo-decision');
    } catch {
        hasUndoRoute = false;
    }
    // Backend hanya mengizinkan undo saat order 'work_in_progress' (aturan yang sama
    // dengan submitDecisions()), jadi tombol untuk keputusan tersimpan ikut aturan itu.
    const canUndoSubmitted = hasUndoRoute && order.status === 'work_in_progress';
    const localDecisionIds = new Set(localDecisions.keys());
    // Kalau SEMUA item ditolak, backend otomatis membatalkan order (all_rejected_cancelled)
    // dan itu tidak bisa di-undo dari halaman ini — customer perlu diperingatkan.
    const willCancelOrder = items.length > 0 && items.every((item) => item.status === 'rejected');

    const handleCancelDecision = (item) => {
        if (localDecisionIds.has(item.id)) {
            setLocalDecisions((prev) => {
                const next = new Map(prev);
                next.delete(item.id);
                return next;
            });
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'pending' } : i)));
            return;
        }
        setUndoTarget(item);
    };

    const handleConfirmUndo = () => {
        if (!undoTarget) return;
        const targetId = undoTarget.id;
        setUndoing(true);
        router.post(
            route('public.report.undo-decision', token),
            { item_id: targetId },
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    if (flashFailed(page)) { setUndoTarget(null); return; }
                    // Update lokal juga: kalau customer punya keputusan lain yang belum
                    // disubmit, effect sinkronisasi dari server sengaja tidak menimpa items.
                    setItems((prev) =>
                        prev.map((i) => (i.id === targetId ? { ...i, status: 'pending', final_price_snapshot: null } : i))
                    );
                    setUndoTarget(null);
                    toast.success('Decision updated.');
                },
                onError: () => {
                    setUndoTarget(null);
                    toast.error("Couldn't update your decision. Please try again.");
                },
                onFinish: () => {
                    setUndoing(false);
                    setUndoTarget(null);
                },
            }
        );
    };

    const handleConfirmSubmit = () => {
        const submittedIds = decidedThisRound.map((item) => item.id);
        setSubmitting(true);
        router.post(
            route('public.report.decide', token),
            { decisions: decidedThisRound.map((item) => ({ id: item.id, status: item.status })) },
            {
                onSuccess: (page) => {
                    if (flashFailed(page)) { setShowModal(false); return; }
                    setShowModal(false);
                    toast.success('Your decisions have been sent.');
                    // Bersihkan localDecisions untuk item yang barusan disubmit — kalau
                    // tidak dibersihkan, entri lama ini bisa memicu bug yang sama lagi
                    // kalau item ini di-reopen admin di kemudian hari (lihat catatan
                    // di deklarasi localDecisions & effect merge di atas).
                    setLocalDecisions((prev) => {
                        const next = new Map(prev);
                        submittedIds.forEach((id) => next.delete(id));
                        return next;
                    });
                },
                onError: () => {
                    setShowModal(false);
                    toast.error("Your decisions weren't sent. Check your connection and try again.");
                },
                onFinish: () => {
                    setSubmitting(false);
                    setShowModal(false);
                },
            }
        );
    };

    const waHref = serviceAdvisor.phone ? `https://wa.me/${toWaDigits(serviceAdvisor.phone)}` : null;
    const bookingWaHref = settings.booking_whatsapp_phone
        ? `https://wa.me/${toWaDigits(settings.booking_whatsapp_phone)}`
        : null;

    const showEstimationSection = ESTIMATION_VISIBLE_STATUSES.includes(order.status);
    const showInvoiceSection = INVOICE_VISIBLE_STATUSES.includes(order.status);
    const isPricingFinal = FINAL_PRICING_STATUSES.includes(order.status);
    const showPaymentSection = order.status === 'invoice_preparation';
    // Di tahap invoice, tugas customer = bayar. Invoice + Payment naik ke atas,
    // daftar item menciut jadi accordion. Status lain: urutan tidak berubah.
    const isInvoiceStage = order.status === 'invoice_preparation';
    const showThankYouSection = THANK_YOU_VISIBLE_STATUSES.includes(order.status);

    const BANK_ACCOUNTS = [
        { bank: 'Bank Mandiri IDR', holder: 'PT Wahana Wirawan', number: '1240012993409' },
        { bank: 'Bank Central Asia IDR', holder: 'PT Wahana Wirawan', number: '7160263789' },
    ];

    const handleCopy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied.`);
        } catch {
            toast.error("Couldn't copy. Please select the number manually.");
        }
    };

    const handleReceiptUpload = (e) => {
        e.preventDefault();
        if (!receiptFile) return;
        setUploadingReceipt(true);
        router.post(
            route('public.report.upload-payment-receipt', token),
            { receipt: receiptFile },
            {
                forceFormData: true,
                onSuccess: (page) => {
                    if (flashFailed(page)) return;
                    setReceiptFile(null);
                    toast.success('Receipt uploaded.');
                },
                onError: (errors) => toast.error(errors?.receipt ?? 'Upload failed. Check your connection and try again.'),
                onFinish: () => setUploadingReceipt(false),
            }
        );
    };

    const workshopName = settings.workshop_name ?? 'Volkswagen PIK';

    const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
    const currentStep = STATUS_STEPS[currentStepIndex];
    const nextStep = STATUS_STEPS[currentStepIndex + 1];
    const CurrentStepIcon = currentStep?.icon;
    const isCancelled = order.status === 'all_rejected_cancelled';
    const progressValue = currentStepIndex >= 0 ? ((currentStepIndex + 1) / STATUS_STEPS.length) * 100 : 0;

    const invoiceBlock = showInvoiceSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <SectionTitle>Invoice Form</SectionTitle>
                                <div className="mt-3">
                                    {invoice ? (
                                        <DocumentCard
                                            onOpen={setViewerDoc}
                                            href={`/storage/${invoice.file_path}`}
                                            title="View Invoice"
                                            subtitle={order.invoice_number ? `No. ${order.invoice_number} · PDF` : 'PDF · Tap to view'}
                                        />
                                    ) : (
                                        <PendingNotice
                                            title="Invoice is being prepared"
                                            text="It will appear here automatically once it's ready."
                                        />
                                    )}
                                </div>
                            </section>
                        </>
                    );
    const paymentBlock = showPaymentSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <SectionTitle>Payment</SectionTitle>
                                <p className="mt-3 text-sm text-gray-700">Transfer to one of the accounts below, then upload your receipt.</p>
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-vw-blue/20 bg-vw-blue/[0.06] px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Amount due</p>
                                        <Rupiah value={grandTotal + inspectionFee} className="block text-xl font-bold text-vw-blue" />
                                        {inspectionFee > 0 && (
                                            <p className="mt-1 text-xs text-gray-600">
                                                Includes inspection fee <Rupiah value={inspectionFee} />.
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-600">Please follow the amount stated on your invoice.</p>
                                    </div>
                                    <button
                                            type="button"
                                            onClick={() => handleCopy(String(Math.round(grandTotal + inspectionFee)), 'Amount')}
                                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-vw-blue/30 bg-white px-3 text-xs font-semibold text-vw-blue hover:bg-vw-blue/5"
                                        >
                                            <Copy className="h-4 w-4" aria-hidden="true" />
                                            Copy
                                        </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {BANK_ACCOUNTS.map((acc) => (
                                        <div key={acc.bank} className="flex items-center justify-between gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900">{acc.bank}</p>
                                                <p className="text-xs text-gray-600">{acc.holder}</p>
                                                <p className="mt-0.5 font-mono text-base font-semibold tracking-wide text-gray-900">{acc.number}</p>
                                            </div>
                                            <button
                                            type="button"
                                            onClick={() => handleCopy(acc.number, 'Account number')}
                                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-vw-blue/30 bg-white px-3 text-xs font-semibold text-vw-blue hover:bg-vw-blue/5"
                                        >
                                            <Copy className="h-4 w-4" aria-hidden="true" />
                                            Copy
                                        </button>
                                        </div>
                                    ))}
                                </div>
                                {(order.invoice_number || order.bill_to) && (
                                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                                        {order.invoice_number && <p>Invoice Number: {order.invoice_number}</p>}
                                        {order.bill_to && <p>Bill To: {order.bill_to}</p>}
                                    </div>
                                )}
                                <div className="mt-5">
                                    <p className="text-sm font-semibold text-gray-900">Payment receipt</p>
                                    {customerPaymentReceipt ? (
                                        <div className="mt-2 space-y-2.5">
                                            <div className="flex items-center gap-2 rounded-lg bg-approved/10 px-3 py-2 text-sm font-medium text-approved">
                                                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                <span>
                                                    Receipt uploaded
                                                    {formatDateTime(customerPaymentReceipt.uploaded_at)
                                                        ? ` · ${formatDateTime(customerPaymentReceipt.uploaded_at)}`
                                                        : ''}
                                                </span>
                                            </div>
                                            <DocumentCard
                                                onOpen={setViewerDoc}
                                                href={`/storage/${customerPaymentReceipt.file_path}`}
                                                title="View your receipt"
                                                subtitle="Tap to view"
                                            />
                                            <p className="text-xs text-vw-grey">
                                                Uploaded the wrong file? Choose a new one below to replace it.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="mt-1 text-sm text-vw-grey">
                                            Upload your proof of transfer once the payment is done.
                                        </p>
                                    )}
                                    <form
                                        onSubmit={handleReceiptUpload}
                                        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
                                    >
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="w-full min-w-0 text-xs text-vw-grey file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-vw-blue/10 file:px-3 file:py-2.5 file:text-xs file:font-semibold file:text-vw-blue hover:file:bg-vw-blue/15 sm:flex-1"
                                            onChange={(e) => setReceiptFile(e.target.files[0])}
                                        />
                                        <button
                                            type="submit"
                                            disabled={uploadingReceipt || !receiptFile}
                                            className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-vw-blue px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-vw-blue/90 disabled:opacity-50 sm:w-auto"
                                        >
                                            {uploadingReceipt ? (
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                            ) : (
                                                <Upload className="h-4 w-4" aria-hidden="true" />
                                            )}
                                            {uploadingReceipt ? 'Uploading...' : customerPaymentReceipt ? 'Replace' : 'Upload'}
                                        </button>
                                    </form>
                                </div>
                            </section>
                        </>
                    );
    const itemsList = (
        <ul className="mt-4 space-y-2.5">
                            {orderedItems.map((item) =>
                                isServerPending(item) ? (
                                    <InspectionItemCard
                                        key={item.id}
                                        item={item}
                                        canDecide={canDecide}
                                        onDecision={handleDecision}
                                        onUndoLocal={handleCancelDecision}
                                        itemRef={(el) => {
                                            if (el) pendingItemRefs.current[item.id] = el;
                                        }}
                                    />
                                ) : (
                                    <DecidedItemRow
                                        key={item.id}
                                        item={item}
                                        canCancel={canDecide && (localDecisionIds.has(item.id) || canUndoSubmitted)}
                                        onCancel={handleCancelDecision}
                                    />
                                )
                            )}
                        </ul>
    );

    return (
        <PublicLayout>
            <Head title="Inspection Report" />

            <div className={`min-h-screen bg-white ${canDecide ? 'pb-28' : 'pb-24'}`}>
                {/* Navbar — kriteria #1: nama VW PIK + logo, terpisah dari hero. */}
                <header className="sticky top-0 z-40 border-b border-vw-grey/10 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                        <Avatar className="h-9 w-9 shrink-0 rounded-sm">
                            <AvatarImage src="/images/vw-logo-navy.jpeg" alt={workshopName} className="object-contain" />
                            <AvatarFallback className="rounded-sm bg-vw-blue text-xs font-bold text-white">
                                {initials(workshopName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-gray-900">{workshopName}</p>
                            <p className="truncate text-[10px] uppercase tracking-widest text-vw-grey">Service Inspection Report</p>
                        </div>
                    </div>
                </header>

                {canDecide && pendingItems.length > 0 && (
                    <div className="mx-auto mt-3 max-w-3xl px-4 sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                        <button
                            type="button"
                            onClick={() => itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm font-semibold text-amber-900"
                        >
                            <span>
                                {pendingItems.length} {pendingItems.length === 1 ? 'item is' : 'items are'} waiting for your decision
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                                Review
                                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </button>
                    </div>
                )}

                {/* Hero image — kriteria #2 & #3: gambar dari upload Settings, ganti-ganti tanpa sentuh kode.
                    Kriteria #13: tidak ada lagi "Report No." di sini.
                    Mobile: aspect ratio dipertinggi (4/3) supaya judul+subtitle tidak sempit,
                    balik ke wide 16/7 mulai breakpoint sm ke atas. */}
                <section className="relative mx-auto mt-4 max-w-3xl overflow-hidden px-4 sm:rounded-lg sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md sm:aspect-[16/7] sm:rounded-lg">
                        {settings.hero_image_path ? (
                            <img
                                src={`/storage/${settings.hero_image_path}`}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-vw-blue to-[#001233]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-vw-blue/90 via-vw-blue/30 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 px-5 pb-4 sm:px-8 sm:pb-5">
                            <h1 className="text-lg font-semibold tracking-tight text-white sm:text-2xl">
                                Vehicle Inspection Report
                            </h1>
                            <p className="mt-0.5 text-sm text-white/80">
                                Prepared for {customer.name}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Status progress — REDESIGN v2: hanya menampilkan 1 tahap aktif (bukan
                    timeline 5 tahap sekaligus) dalam kartu ber-background solid, supaya
                    customer langsung fokus ke tahap sekarang. Tahap lain cuma diwakili
                    segmented bar tipis + hint "Next: ..." di bawahnya. */}
                <section className="mt-6 px-4 sm:px-10 xl:mx-auto xl:max-w-4xl xl:px-24">
                    {isCancelled ? (
                        <div className="flex items-center gap-2 rounded-md border border-vw-grey/20 bg-vw-grey-light px-4 py-2.5 text-sm font-medium text-vw-grey">
                            This order has been cancelled.
                        </div>
                    ) : (
                        currentStep && (
                            <div className="rounded-lg bg-vw-blue p-5 text-white shadow-md sm:p-6">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                                        Current Progress
                                    </p>
                                    <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                                        Step {currentStepIndex + 1} of {STATUS_STEPS.length}
                                    </span>
                                </div>

                                <div className="mt-4 flex items-center gap-4">
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/10 sm:h-16 sm:w-16">
                                        <CurrentStepIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xl font-bold leading-tight sm:text-2xl">{currentStep.label}</p>
                                        <p className="mt-1 text-sm leading-snug text-white/80">{currentStep.description}</p>
                                    </div>
                                </div>

                                {/* Segmented bar: tahap yang sudah lewat & tahap sekarang terisi putih,
                                    sisanya redup. Tidak ada label per-tahap supaya tetap fokus. */}
                                <div className="mt-5 flex gap-1.5" role="progressbar" aria-label="Service progress" aria-valuemin={1} aria-valuemax={STATUS_STEPS.length} aria-valuenow={currentStepIndex + 1}>
                                    {STATUS_STEPS.map((step, idx) => (
                                        <div
                                            key={step.key}
                                            className={`h-1.5 flex-1 rounded-full ${idx <= currentStepIndex ? 'bg-white' : 'bg-white/25'}`}
                                        />
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-white/70">
                                    {nextStep ? `Next: ${nextStep.label}` : 'All steps completed'}
                                </p>
                            </div>
                        )
                    )}
                </section>

                <div className="mx-auto max-w-3xl px-4 sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                    {/* Vehicle & customer strip — kriteria #4: License Number, bukan Plate Number.
                        truncate ditambahkan supaya plat nomor panjang tidak overflow di grid sempit. */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6">
                        <div className="min-w-0 rounded-md border border-vw-grey/15 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-vw-grey">License Number</p>
                            <p className="mt-0.5 truncate font-mono text-sm font-semibold text-gray-900">{vehicle.plate_number}</p>
                        </div>
                        <div className="min-w-0 rounded-md border border-vw-grey/15 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-vw-grey">Customer</p>
                            <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{customer.name}</p>
                        </div>
                    </div>

                    {isInvoiceStage && (
                        <div className="mt-8 [&>*:first-child]:hidden">
                            {invoiceBlock}
                            {paymentBlock}
                        </div>
                    )}

                    {/* Video — kriteria #5: 1 slot saja, tidak ada tab pilihan part. */}
                    <section className="mt-8">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Inspection Video</h2>

                        {video ? (
                            embedUrl ? (
                                <div className="mt-3 aspect-video overflow-hidden rounded-md">
                                    <iframe
                                        src={embedUrl}
                                        title="Inspection video"
                                        className="h-full w-full"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            ) : (
                                <video src={video.video_url} controls playsInline preload="metadata" className="mt-3 aspect-video w-full rounded-md bg-black" />
                            )
                        ) : (
                            <p className="mt-3 text-sm text-vw-grey">No video available yet.</p>
                        )}

                        {/* Kriteria #6: pesan dari Kepala Teknisi, bukan generic.
                            Desain minimalis: tanpa kartu/border/shadow, cuma avatar kecil +
                            teks pesan + nama & jabatan satu baris di bawahnya. */}
                        {order.personal_message && (
                            <div className="mt-5 flex items-start gap-3">
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarImage
                                        src={chiefTechnician?.photo_path ? `/storage/${chiefTechnician.photo_path}` : undefined}
                                        alt={chiefTechnician?.name ?? 'Chief Technician'}
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-vw-grey-light text-[11px] font-semibold text-vw-grey">
                                        {initials(chiefTechnician?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">
                                        {order.personal_message}
                                    </p>
                                    <p className="mt-1.5 text-xs text-vw-grey">
                                        {chiefTechnician?.name ?? 'Chief Technician'} · Chief Technician
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>

                    <Separator className="my-8" />

                    {/* Banner Quality Control — dipoles: kartu gradient, ikon dengan ring berdenyut
                        (dimatikan otomatis untuk yang prefers-reduced-motion), plus 2 chip yang
                        menjelaskan apa yang sedang dikerjakan. Chip sengaja statis (bukan
                        checklist progres) karena sistem tidak melacak progres per langkah. */}
                    {order.status === 'quality_control' && (
                        <>
                            <section>
                                <div className="rounded-xl border border-vw-blue/20 bg-gradient-to-br from-vw-blue/10 via-vw-blue/[0.05] to-white p-5 shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                                            <span className="absolute inset-0 rounded-full bg-vw-blue/25 motion-safe:animate-ping" aria-hidden="true" />
                                            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-vw-blue text-white shadow-md">
                                                <Sparkles className="h-6 w-6" aria-hidden="true" />
                                            </span>
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-base font-bold leading-snug text-gray-900">
                                                Your vehicle is being checked and washed
                                            </p>
                                            <p className="mt-1 text-sm leading-snug text-vw-grey">
                                                Final quality control is in progress. We'll notify you once the invoice is ready.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-vw-blue shadow-sm ring-1 ring-vw-blue/15">
                                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                            Final inspection
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-vw-blue shadow-sm ring-1 ring-vw-blue/15">
                                            <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                                            Car wash
                                        </span>
                                    </div>
                                </div>
                            </section>
                            <Separator className="my-8" />
                        </>
                    )}

                    {/* Inspection Items — REDESIGN v3: grouping visual (Safety/Durability/dst)
                        SENGAJA DILEPAS — customer awam tidak familiar dengan istilah grup
                        internal itu. Sebagai gantinya: item pending selalu naik ke atas
                        (orderedItems), kartu pending dibuat tipis+ringkas, item yang sudah
                        diputuskan menciut jadi 1 baris (DecidedItemRow), chip "Jump to next"
                        membantu lompat antar item pending, dan ada sticky bottom bar (progress
                        + total + tombol Submit) supaya customer tidak perlu scroll ke bawah. */}
                    <section ref={itemsSectionRef} className="scroll-mt-20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Inspection Items</h2>
                            <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset
                                    ${isPricingFinal ? 'bg-approved/10 text-approved ring-approved/25' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}
                            >
                                {isPricingFinal ? 'Final Price' : 'Estimated Price'}
                            </span>
                        </div>

                        {isLocked && !hasPendingItems && (
                            <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2.5 text-sm font-medium text-gray-700">
                                {canDecide && canUndoSubmitted
                                    ? 'All items have been decided. You can still change a decision until your vehicle enters quality control.'
                                    : canDecide
                                        ? 'All items have been decided for this report.'
                                        : 'All items have been decided. Decisions can no longer be changed.'}
                            </p>
                        )}
                        {isLocked && hasPendingItems && !canDecide && (
                            <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2.5 text-sm font-medium text-gray-700">
                                This report is no longer accepting new decisions.
                            </p>
                        )}

                        {/* Chip "Jump to next" — bantu customer lompat antar item pending
                            tanpa perlu grouping (grouping sengaja dilewati, lihat catatan
                            di bagian atas file). Cuma tampil kalau item pending > 1, karena
                            kalau cuma 1 item pending tidak ada gunanya lompat kemana-mana. */}
                        {canDecide && pendingItems.length > 1 && (
                            <button
                                type="button"
                                onClick={handleJumpToPending}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-vw-blue/25 bg-vw-blue/5 px-3 py-1.5 text-xs font-semibold text-vw-blue transition hover:bg-vw-blue/10"
                            >
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                                Jump to next ({pendingItems.length} waiting)
                            </button>
                        )}

                        {isInvoiceStage ? (
                            <Accordion type="single" collapsible className="mt-4">
                                <AccordionItem value="items" className="rounded-lg border border-vw-grey/15 px-4">
                                    <AccordionTrigger className="min-h-[48px] text-sm font-semibold text-gray-900">
                                        Inspection items ({items.length})
                                    </AccordionTrigger>
                                    <AccordionContent>{itemsList}</AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        ) : (
                            itemsList
                        )}

                        {/* Ringkasan harga + total diskon */}
                        <div className="mt-8 overflow-hidden rounded-xl border border-vw-grey/15 bg-white shadow-lg">
                            {totalDiscount > 0 && (
                                <div className="flex items-center gap-3 border-b border-approved/20 bg-gradient-to-r from-approved/15 to-approved/5 px-5 py-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-approved text-white shadow-sm">
                                        <Tag className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-approved">
                                            Total discount you get
                                        </p>
                                        <Rupiah value={totalDiscount} className="block text-2xl font-bold text-approved" />
                                        <p className="text-[11px] text-vw-grey">Rejected items are not counted.</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2.5 px-5 py-4 text-sm text-vw-grey">
                                {totalDiscount > 0 && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span>Price before discount</span>
                                            <Rupiah value={listTotal} className="text-gray-700" />
                                        </div>
                                        <div className="flex items-center justify-between font-medium text-approved">
                                            <span>Discount</span>
                                            <span className="whitespace-nowrap">
                                                −<Rupiah value={totalDiscount} />
                                            </span>
                                        </div>
                                    </>
                                )}
                                <div className="flex items-center justify-between">
                                    <span>Subtotal</span>
                                    <Rupiah value={subtotal} className="text-gray-700" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>VAT ({vatPercent}%)</span>
                                    <Rupiah value={vatAmount} className="text-gray-700" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 bg-vw-blue/[0.06] px-5 py-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-vw-grey">
                                    {isPricingFinal ? 'Final Total' : 'Estimated Total'}
                                </span>
                                <Rupiah value={grandTotal} className="text-2xl font-bold text-vw-blue" />
                            </div>

                            {inspectionFee > 0 && (
                                <>
<div className="flex items-start justify-between gap-3 border-t border-vw-grey/15 px-5 py-3 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-800">Inspection fee</p>
                                        {order.inspection_fee_note && (
                                            <p className="text-xs text-gray-600">{order.inspection_fee_note}</p>
                                        )}
                                        <p className="text-xs text-gray-600">Not included in the item total above.</p>
                                    </div>
                                    <Rupiah value={inspectionFee} className="shrink-0 font-semibold text-gray-900" />
                                </div>
                                    <div className="flex items-center justify-between gap-3 border-t border-vw-grey/15 bg-vw-blue/[0.06] px-5 py-4">
                                        <span className="text-xs font-bold uppercase tracking-wider text-vw-blue">Total with inspection fee</span>
                                        <Rupiah value={grandTotal + inspectionFee} className="text-xl font-bold text-vw-blue" />
                                    </div>
                                </>
                            )}
                        </div>

                        {!isPricingFinal && (
                            <p className="mt-2 text-xs italic text-vw-grey">
                                These prices are estimates and may change until finalized after inspection review.
                            </p>
                        )}

                        {canDecide && hasPendingItems && !hasDecisionToSubmit && (
                            <p className="mt-3 text-center text-xs text-vw-grey">
                                You can decide on some items now and come back later for the rest.
                            </p>
                        )}
                    </section>

                    {/* Kriteria #9: section kondisional tetap ikut arahan status yang sudah ada. */}
                    {showEstimationSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <SectionTitle count={estimationDocuments?.length ?? 0}>Estimation Form</SectionTitle>
                                <div className="mt-3">
                                    {estimationDocuments?.length > 0 ? (
                                        <div className="space-y-2.5">
                                            {estimationDocuments.map((doc) => (
                                                <DocumentCard
                                                    onOpen={setViewerDoc}
                                                    key={doc.id}
                                                    href={`/storage/${doc.pdf_path}`}
                                                    title={`${GROUP_LABEL[doc.group] ?? doc.group} Estimation`}
                                                    subtitle="PDF · Tap to view"
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <PendingNotice
                                            title="Estimation form is being prepared"
                                            text="It will appear here automatically once it's ready."
                                        />
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    {!isInvoiceStage && invoiceBlock}

                    {!isInvoiceStage && paymentBlock}

                    {showThankYouSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <div className="rounded-md border border-approved/20 bg-approved/5 px-5 py-5 text-center">
                                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-sm bg-approved/10">
                                        <CheckCircle2 className="h-5 w-5 text-approved" />
                                    </span>
                                    <h2 className="mt-3 text-base font-bold text-gray-900">Thank You!</h2>
                                    <p className="mt-1 text-sm text-gray-700">
                                        Thank you for trusting {workshopName} with your vehicle service. We hope to see you again soon.
                                    </p>
                                </div>
                                <div className="mt-4 space-y-2">
                                    {settings.era_phone && (
                                        <a href={`tel:${settings.era_phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm text-gray-700 min-h-[44px]">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                                <Phone className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-medium text-gray-900">Emergency Road Assist (ERA)</span>
                                                <span className="font-mono text-xs text-vw-grey">{settings.era_phone}</span>
                                            </span>
                                        </a>
                                    )}
                                    {bookingWaHref && (
                                        <a
                                            href={bookingWaHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:bg-vw-blue/[0.03] hover:text-vw-blue"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                                <MessageCircle className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-medium text-gray-900">Book your next service</span>
                                                <span className="text-xs text-vw-grey">Chat with us on WhatsApp</span>
                                            </span>
                                        </a>
                                    )}
                                    {settings.survey_form_url && (
                                        <a
                                            href={settings.survey_form_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-vw-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-vw-blue/90"
                                        >
                                            Share Your Feedback
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    <Separator className="my-8" />

                    {order.status === 'invoice_preparation' && waHref && (
                        <section>
                            <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-vw-blue/20 bg-vw-blue/5 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                                <div>
                                    <span className="inline-block rounded-sm bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                        Ready for Pickup
                                    </span>
                                    <p className="mt-1.5 text-sm font-semibold text-gray-900">Pay, then upload your receipt</p>
                                    <p className="mt-0.5 text-xs text-vw-grey">Have questions? Reach out to your service advisor.</p>
                                </div>
                                <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-vw-blue px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-vw-blue/90 sm:w-auto sm:min-h-0"
                                >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    Contact SA
                                </a>
                            </div>
                        </section>
                    )}

                    <Separator className="my-8" />

                    {/* Contact SA — kriteria #10: foto SA yang diupload admin, dengan fallback inisial. */}
                    <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Contact</h2>
                            <div className="mt-2 flex items-center gap-3">
                                <Avatar className="h-12 w-12 shrink-0">
                                    <AvatarImage
                                        src={serviceAdvisor.photo_path ? `/storage/${serviceAdvisor.photo_path}` : undefined}
                                        alt={serviceAdvisor.name}
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-vw-blue text-sm font-bold text-white">
                                        {initials(serviceAdvisor.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-gray-900">{serviceAdvisor.name}</p>
                                    <p className="text-sm text-vw-grey">Service Advisor</p>
                                </div>
                            </div>

                            <div className="mt-3 space-y-2">
                                {serviceAdvisor.phone && (
                                    <a
                                        href={waHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex min-h-[44px] items-center gap-2.5 rounded-md border border-vw-grey/15 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:text-vw-blue"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                            <MessageCircle className="h-4 w-4" />
                                        </span>
                                        <span className="truncate">WhatsApp <span className="font-mono">{serviceAdvisor.phone}</span></span>
                                    </a>
                                )}
                                <a
                                    href={`mailto:${serviceAdvisor.email}`}
                                    className="flex min-h-[44px] items-center gap-2.5 rounded-md border border-vw-grey/15 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:text-vw-blue"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                        <Mail className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 break-all font-mono text-xs">{serviceAdvisor.email}</span>
                                </a>
                            </div>
                        </div>

                        {/* Location — kriteria #11: dirapikan, embed diprioritaskan kalau ada. */}
                        <div>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Location</h2>
                            <div className="mt-2 flex items-start gap-2.5 rounded-md border border-vw-grey/15 px-3 py-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                    <MapPin className="h-4 w-4" />
                                </span>
                                <p className="min-w-0 text-sm text-gray-700">{settings.address ?? '[Address]'}</p>
                            </div>

                            {settings.google_maps_embed_url && (
                                <iframe
                                    src={settings.google_maps_embed_url}
                                    width="100%"
                                    height="180"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    title="Workshop location map"
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    className="mt-3 w-full rounded-md border border-vw-grey/15"
                                />
                            )}

                            <div className="mt-3 flex flex-wrap gap-2">
                                {settings.google_maps_url && (
                                    <a
                                        href={settings.google_maps_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-vw-grey px-4 py-2 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                    >
                                        <MapPin className="h-3.5 w-3.5" />
                                        Open in Maps
                                    </a>
                                )}
                                {settings.website_url && (
                                    <a
                                        href={settings.website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-vw-grey px-4 py-2 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                    >
                                        <Globe className="h-3.5 w-3.5" />
                                        Visit Website
                                    </a>
                                )}
                                {bookingWaHref && (
                                    <a
                                        href={bookingWaHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-vw-blue px-4 py-2 text-xs font-semibold text-vw-blue hover:bg-vw-blue hover:text-white"
                                    >
                                        <MessageCircle className="h-3.5 w-3.5" />
                                        Book a service
                                    </a>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Sticky bottom bar — progres + total + tombol Submit selalu terlihat
                selama status order masih bisa diputuskan, jadi customer tidak perlu
                scroll ke paling bawah untuk tahu sisa pekerjaannya atau untuk submit.
                Disembunyikan begitu tidak ada lagi yang bisa dikerjakan (semua sudah
                submit & tidak ada keputusan baru menunggu). */}
            {canDecide && (hasPendingItems || hasDecisionToSubmit) && (
                <div
                    className="fixed inset-x-0 bottom-0 z-40 border-t border-vw-grey/15 bg-white/95 backdrop-blur"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-gray-800">
                                {decidedItemsList.length} of {items.length} decided
                            </p>
                            <p className="text-xs text-gray-600">
                                Estimated items total{" "}
                                <Rupiah value={grandTotal} className="text-sm font-bold text-vw-blue" />
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            disabled={!hasDecisionToSubmit}
                            className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-vw-blue px-4 text-xs font-semibold text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90 disabled:cursor-not-allowed disabled:bg-vw-grey/30 disabled:text-vw-grey disabled:shadow-none"
                        >
                            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {hasDecisionToSubmit ? `Submit (${decidedThisRound.length})` : 'Submit'}
                        </button>
                    </div>
                </div>
            )}

            {/* Modal konfirmasi final — REDESIGN: ikon header, tile ringkasan approved/rejected,
                daftar item berikon, panel total (termasuk diskon), tombol footer tumpuk
                vertikal (flex-col-reverse) di mobile sempit lalu bersisian mulai breakpoint sm. */}
            <Sheet open={showModal} onOpenChange={setShowModal}>
                <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-md">
                    <SheetHeader className="text-left">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-vw-blue/10 text-vw-blue">
                                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <SheetTitle>Confirm your decision</SheetTitle>
                                <SheetDescription>
                                    {willCancelOrder
                                        ? 'Please double-check before you submit.'
                                        : canUndoSubmitted
                                            ? 'You can still change a decision until your vehicle enters quality control.'
                                            : 'This action is final and cannot be changed afterwards for the items below.'}
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>

                    {willCancelOrder && (
                        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <p>
                                You rejected every item, so this order will be cancelled. This cannot be undone from this page.
                            </p>
                        </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-approved/10 px-4 py-3 text-approved">
                            <p className="text-2xl font-bold tabular-nums leading-none">{decidedApprovedItems.length}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider">Approved</p>
                        </div>
                        <div className="rounded-xl bg-vw-grey/10 px-4 py-3 text-vw-grey">
                            <p className="text-2xl font-bold tabular-nums leading-none">{decidedRejectedCount}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider">Rejected</p>
                        </div>
                    </div>

                    <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
                        {decidedThisRound.map((item) => {
                            const ok = item.status === 'approved';
                            return (
                                <li
                                    key={item.id}
                                    className="flex items-center gap-3 rounded-lg border border-vw-grey/15 bg-white px-3 py-2.5 shadow-sm"
                                >
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-approved text-white' : 'bg-vw-grey/15 text-vw-grey'}`}
                                    >
                                        {ok ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
                                    </span>
                                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${ok ? 'text-gray-800' : 'text-vw-grey'}`}>
                                        {item.name}
                                    </span>
                                    {ok ? (
                                        <Rupiah value={itemDisplayPrice(item)} className="text-sm font-semibold text-gray-900" />
                                    ) : (
                                        <span className="text-xs font-medium text-vw-grey">Rejected</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {decidedApprovedItems.length > 0 && (
                        <div className="mt-4 space-y-2 rounded-xl bg-vw-grey-light/70 p-4 text-sm text-vw-grey">
                            {decidedDiscount > 0 && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span>Price before discount</span>
                                        <Rupiah value={decidedListTotal} className="text-gray-700" />
                                    </div>
                                    <div className="flex items-center justify-between font-medium text-approved">
                                        <span>Discount</span>
                                        <span className="whitespace-nowrap">
                                            −<Rupiah value={decidedDiscount} />
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="flex items-center justify-between">
                                <span>Subtotal</span>
                                <Rupiah value={decidedApprovedSubtotal} className="text-gray-700" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span>VAT ({vatPercent}%)</span>
                                <Rupiah value={decidedApprovedTotal - decidedApprovedSubtotal} className="text-gray-700" />
                            </div>
                            <div className="flex items-center justify-between border-t border-vw-grey/20 pt-3">
                                <span className="text-xs font-bold uppercase tracking-wider">Total (this submission)</span>
                                <Rupiah value={decidedApprovedTotal} className="text-2xl font-bold text-vw-blue" />
                            </div>
                        </div>
                    )}

                    <SheetFooter className="mt-5 flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                        <SheetClose asChild>
                            <button
                                type="button"
                                disabled={submitting}
                                className="min-h-[48px] flex-1 rounded-xl border border-vw-grey/30 bg-white text-sm font-semibold text-vw-grey transition hover:bg-vw-grey-light disabled:opacity-50"
                            >
                                Back
                            </button>
                        </SheetClose>
                        <button
                            type="button"
                            onClick={handleConfirmSubmit}
                            disabled={submitting}
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-vw-blue text-sm font-semibold text-white shadow-lg shadow-vw-blue/25 transition hover:bg-vw-blue/90 disabled:opacity-50"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                            )}
                            {submitting ? 'Submitting...' : 'Confirm & Submit'}
                        </button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Modal batalkan keputusan (untuk keputusan yang sudah tersimpan di server). */}
            <Sheet open={!!undoTarget} onOpenChange={(open) => { if (!open && !undoing) setUndoTarget(null); }}>
                <SheetContent side="bottom" className="rounded-t-2xl sm:mx-auto sm:max-w-md">
                    <SheetHeader className="text-left">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <Undo2 className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <SheetTitle>Change your decision?</SheetTitle>
                                <SheetDescription>
                                    This item goes back to waiting for your approval. You can approve or reject it again afterwards.
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>

                    {undoTarget && (
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-vw-grey/15 bg-vw-grey-light/60 px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">{undoTarget.name}</p>
                                <div className="mt-1">
                                    <StatusStamp status={undoTarget.status} />
                                </div>
                            </div>
                            {undoTarget.status === 'approved' && (
                                <Rupiah value={itemDisplayPrice(undoTarget)} className="text-base font-bold text-gray-900" />
                            )}
                        </div>
                    )}

                    <SheetFooter className="mt-5 flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                        <button
                            type="button"
                            onClick={() => setUndoTarget(null)}
                            disabled={undoing}
                            className="min-h-[48px] flex-1 rounded-xl border border-vw-grey/30 bg-white text-sm font-semibold text-vw-grey transition hover:bg-vw-grey-light disabled:opacity-50"
                        >
                            Keep decision
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmUndo}
                            disabled={undoing}
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-vw-blue text-sm font-semibold text-white shadow-lg shadow-vw-blue/25 transition hover:bg-vw-blue/90 disabled:opacity-50"
                        >
                            {undoing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {undoing ? 'Updating...' : 'Yes, change it'}
                        </button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
            {/* Viewer dokumen layar penuh (PDF/foto) dengan tombol Back. */}
            {viewerDoc && (
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80">
                            <Loader2 className="h-6 w-6 animate-spin text-vw-blue" aria-hidden="true" />
                        </div>
                    }
                >
                    <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />
                </Suspense>
            )}
        </PublicLayout>
    );
}