import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Phone, MessageCircle, FileText, CheckCircle2, ExternalLink, Wrench, ShieldCheck, Receipt, BadgeCheck, Check, X, Clock, Undo2, Tag, ClipboardCheck, Loader2, AlertTriangle, Upload, ChevronRight, ChevronDown, ArrowDown, Copy, MapPin, Globe, Landmark, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/Components/ui/avatar';
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

// Kartu "melayang": putih, sudut besar, bayangan lembut + ring tipis (gaya referensi payment/cart).
const SOFT_CARD = 'rounded-3xl bg-white ring-1 ring-black/[0.04] shadow-[0_12px_40px_-16px_rgba(22,27,89,0.22)]';

function StatusStamp({ status }) {
    const config = {
        pending: { label: 'Waiting', Icon: Clock, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
        approved: { label: 'Approved', Icon: Check, cls: 'bg-approved/10 text-approved ring-approved/25' },
        rejected: { label: 'Rejected', Icon: X, cls: 'bg-gray-100 text-gray-700 ring-gray-300' },
    }[status] ?? { label: status, Icon: Clock, cls: 'bg-vw-grey/10 text-vw-grey ring-vw-grey/25' };
    const { label, Icon, cls } = config;

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}
        >
            <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            {label}
        </span>
    );
}

// Logo WhatsApp (gelembung chat + gagang telepon). lucide-react tidak punya ikon brand,
// jadi digambar inline; mengikuti warna teks lewat currentColor.
function WhatsAppIcon({ className = '' }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M3 21l1.65-4.9A9 9 0 1 1 8 19.4L3 21z" />
            <g transform="translate(6.6 6.6) scale(0.45)" strokeWidth="3.6">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </g>
        </svg>
    );
}

// Logo bank dari /public/images/banks/. Kalau file belum ada / gagal dimuat,
// otomatis jatuh ke ikon gedung bank supaya tampilan tidak rusak.
function BankLogo({ src, alt }) {
    const [failed, setFailed] = useState(false);
    return (
        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-black/[0.06]">
            {src && !failed ? (
                <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
            ) : (
                <Landmark className="h-5 w-5 text-vw-blue" aria-label={alt} />
            )}
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
        <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">{children}</h2>
            {count > 1 && (
                <span className="rounded-full bg-vw-blue/10 px-2 py-0.5 text-xs font-bold text-vw-blue">{count}</span>
            )}
        </div>
    );
}

// Kartu dokumen (PDF estimation, invoice, bukti bayar). Klik/tap membuka viewer di dalam
// halaman (onOpen) — customer iPhone tidak perlu lagi pindah tab lalu cari tab lama.
// Tetap <a href target="_blank"> supaya long-press / klik-tengah / "open in new tab"
// masih berfungsi, dan tetap jalan kalau JS gagal.
function DocumentCard({ href, title, subtitle, onOpen, variant = 'row' }) {
    const isTile = variant === 'tile';
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
            className={`group ${SOFT_CARD} transition hover:ring-vw-blue/30 ${isTile ? 'flex flex-col gap-3 p-4' : 'flex items-center gap-3 p-3.5'}`}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-vw-grey-light text-vw-blue transition-colors group-hover:bg-vw-blue group-hover:text-white">
                <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className={`flex min-w-0 flex-1 justify-between gap-2 ${isTile ? 'items-end' : 'items-center'}`}>
                <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold leading-snug text-gray-900">{title}</span>
                    <span className="block truncate text-xs text-vw-grey">{subtitle}</span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vw-grey-light text-vw-blue">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
            </span>
        </a>
    );
}

// Ilustrasi tahap di hero: public/images/stages/{key}.jpg
// Customer hanya melihat 4 tahap (tanpa appointment), jadi tidak ada gambar appointment.
// Kalau ada key lain tanpa gambar, otomatis pakai ikon tahap sebagai fallback.
const STAGE_ILLUSTRATIONS = ['work_in_progress', 'quality_control', 'invoice_preparation', 'completed'];

function StageIllustration({ step }) {
    if (!step) return <div className="h-24" />;
    const Icon = step.icon;
    return (
        <div className="relative -mx-5 mt-3 flex min-h-[8rem] items-center justify-center sm:mx-0">
            {STAGE_ILLUSTRATIONS.includes(step.key) ? (
                <img
                    src={`/images/stages/${step.key}.jpg`}
                    alt=""
                    className="max-h-72 w-full object-contain mix-blend-multiply sm:max-h-80"
                />
            ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-full bg-vw-blue/10 text-vw-blue ring-8 ring-vw-blue/5">
                    <Icon className="h-11 w-11" aria-hidden="true" />
                </span>
            )}
        </div>
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
                className="text-[13px] leading-snug text-gray-600"
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
function InspectionItemCard({ item, canDecide, onDecision, onUndoLocal }) {
    const discount = itemDiscountAmount(item);
    const listPrice = itemListPrice(item);
    const showStruckPrice = discount > 0 && listPrice > itemDisplayPrice(item);
    const isLocked = item.final_price_snapshot !== null && item.final_price_snapshot !== undefined;

    return (
        <li
            className={`relative scroll-mt-24 overflow-hidden rounded-3xl p-4 ring-1 shadow-[0_12px_40px_-16px_rgba(22,27,89,0.22)] transition ${item.status === 'approved' ? 'bg-approved/5 ring-approved/40' : 'bg-white ring-black/[0.04]'}`}
        >
            <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 break-words text-[15px] font-bold leading-snug text-gray-900">{item.name}</h3>
                <StatusStamp status={item.status} />
            </div>
            <ItemDescription text={item.description} />

            {showStruckPrice && (
                <dl className="mt-3 space-y-2 text-[13px]">
                    <div className="flex items-center justify-between gap-3">
                        <dt className="text-vw-grey">Price</dt>
                        <dd className="font-semibold text-gray-900"><Rupiah value={listPrice} /></dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <dt className="text-vw-grey">Discount</dt>
                        <dd className="whitespace-nowrap font-semibold text-approved">−<Rupiah value={discount} /></dd>
                    </div>
                </dl>
            )}

            <div className="my-3 border-t border-dashed border-vw-grey/30" />

            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <Rupiah value={itemDisplayPrice(item)} className="text-xl font-bold text-vw-blue" />
            </div>
            <p className="mt-0.5 text-right text-xs text-vw-grey">
                {isLocked ? 'Price includes VAT' : 'Price excludes VAT'}
            </p>

            {canDecide && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {item.status === 'pending' ? (
                        <>
                            <button
                                type="button"
                                onClick={() => onDecision(item.id, 'approved')}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-approved/60 bg-white px-3 text-[13px] font-semibold text-approved transition hover:bg-approved/10 active:scale-95"
                            >
                                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                Approve
                            </button>
                            <button
                                type="button"
                                onClick={() => onDecision(item.id, 'rejected')}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-gray-400 bg-white px-3 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                            >
                                <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                Reject
                            </button>
                        </>
                    ) : (
                        <>
                            <div
                                role="status"
                                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white ${item.status === 'approved' ? 'bg-approved' : 'bg-gray-700'}`}
                            >
                                {item.status === 'approved' ? (
                                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                ) : (
                                    <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                )}
                                {item.status === 'approved' ? 'Approved' : 'Rejected'}
                            </div>
                            <button
                                type="button"
                                onClick={() => onUndoLocal(item)}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-vw-grey/30 bg-white px-3 text-[13px] font-semibold text-gray-700 transition hover:bg-vw-grey-light active:scale-95"
                            >
                                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Change
                            </button>
                        </>
                    )}
                </div>
            )}
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
        <li className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 ring-1 ring-black/[0.04] shadow-[0_10px_30px_-16px_rgba(22,27,89,0.22)]">
            <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isApproved ? 'bg-approved text-white' : 'bg-vw-grey/20 text-vw-grey'}`}
            >
                {isApproved ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
                <p className={`break-words text-sm font-medium leading-snug ${isApproved ? 'text-gray-800' : 'text-gray-600 line-through decoration-1'}`}>
                    {item.name}
                </p>
                {isApproved ? (
                    <Rupiah value={itemDisplayPrice(item)} className="mt-0.5 block text-sm font-semibold text-gray-900" />
                ) : (
                    <p className="mt-0.5 text-xs font-medium text-gray-600">Rejected</p>
                )}
            </div>
            {canCancel && (
                <button
                    type="button"
                    onClick={() => onCancel(item)}
                    className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-gray-600 transition hover:bg-vw-blue/5 hover:text-vw-blue"
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
    // Ref section item (dipakai banner "Review" untuk scroll ke daftar item).
    const itemsSectionRef = useRef(null);

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
    // Tahap invoice & completed: daftar item tidak lagi jadi fokus, jadi dilipat
    // dalam accordion (default tertutup). Order summary tetap terlihat.
    const collapseItems = isInvoiceStage || order.status === 'completed';

    const BANK_ACCOUNTS = [
        { bank: 'Bank Mandiri', holder: 'PT Wahana Wirawan', number: '1240012993409', logo: '/images/banks/mandiri.png' },
        { bank: 'Bank Central Asia (BCA)', holder: 'PT Wahana Wirawan', number: '7160263789', logo: '/images/banks/bca.png' },
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

    // Baris inspection fee di Order summary (tampil kalau ada biayanya).
    const inspectionFeeRow = inspectionFee > 0 && (
        <div className="flex items-start justify-between gap-3">
            <dt className="min-w-0 text-vw-grey">
                Inspection fee
                {order.inspection_fee_note && (
                    <span className="block text-xs">{order.inspection_fee_note}</span>
                )}
            </dt>
            <dd className="shrink-0 font-semibold text-gray-900"><Rupiah value={inspectionFee} /></dd>
        </div>
    );

    // Customer hanya melihat 4 tahap (mulai In Progress). Kalau status 'appointment' sempat
    // sampai ke halaman ini, tampilkan sebagai tahap pertama.
    const stepKey = order.status === 'appointment' ? 'work_in_progress' : order.status;
    const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === stepKey);
    const currentStep = STATUS_STEPS[currentStepIndex];
    const nextStep = STATUS_STEPS[currentStepIndex + 1];
    const prevStep = currentStepIndex > 0 ? STATUS_STEPS[currentStepIndex - 1] : null;
    const isCancelled = order.status === 'all_rejected_cancelled';
    const progressValue = currentStepIndex >= 0 ? ((currentStepIndex + 1) / STATUS_STEPS.length) * 100 : 0;

    const invoiceBlock = showInvoiceSection && (
                        <>
                            <div className="my-6" />
                            <section>
                                <SectionTitle>Invoice form</SectionTitle>
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
                            <div className="my-6" />
                            <section>
                                <SectionTitle>Payment</SectionTitle>
                                <p className="mt-2 text-sm text-vw-grey">Transfer to one of the accounts below, then upload your receipt.</p>

                                <div className={`mt-4 p-5 ${SOFT_CARD}`}>
                                    <p className="text-base font-bold text-gray-900">Payment details</p>
                                    {(order.invoice_number || order.bill_to) && (
                                    <>
                                    <dl className="mt-4 space-y-3 text-sm">
                                        {order.invoice_number && (
                                            <div className="flex items-center justify-between gap-3">
                                                <dt className="text-vw-grey">Invoice number</dt>
                                                <dd className="font-semibold text-gray-900">{order.invoice_number}</dd>
                                            </div>
                                        )}
                                        {order.bill_to && (
                                            <div className="flex items-center justify-between gap-3">
                                                <dt className="shrink-0 text-vw-grey">Bill to</dt>
                                                <dd className="min-w-0 text-right font-semibold text-gray-900">{order.bill_to}</dd>
                                            </div>
                                        )}
                                    </dl>
                                    <div className="my-4 border-t border-dashed border-vw-grey/30" />
                                    </>
                                    )}
                                    <div className="mt-4 flex items-center justify-between gap-3">
                                        <span className="text-sm font-bold text-gray-900">Amount due</span>
                                        <Rupiah value={grandTotal + inspectionFee} className="text-2xl font-bold text-vw-blue" />
                                    </div>
                                    <p className="mt-2 text-xs text-vw-grey">Please follow the amount stated on your invoice.</p>
                                </div>

                                <div className={`mt-4 divide-y divide-dashed divide-vw-grey/30 p-5 ${SOFT_CARD}`}>
                                    {BANK_ACCOUNTS.map((acc) => (
                                        <div key={acc.bank} className="py-4 first:pt-0 last:pb-0">
                                            <div className="flex items-center gap-3">
                                                <BankLogo src={acc.logo} alt={acc.bank} />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold leading-snug text-gray-900">{acc.bank}</p>
                                                    <p className="text-xs text-vw-grey">Account name</p>
                                                    <p className="text-sm font-semibold leading-snug text-gray-900">{acc.holder}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-vw-grey">Account number</p>
                                                    <p className="mt-0.5 break-all text-xl font-bold tabular-nums tracking-wide text-gray-900">{acc.number}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(acc.number, 'Account number')}
                                                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-vw-grey/30 bg-white px-3.5 text-xs font-semibold text-gray-900 hover:bg-vw-grey-light"
                                                >
                                                    <Copy className="h-4 w-4" aria-hidden="true" />
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className={`mt-4 p-5 ${SOFT_CARD}`}>
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
                                                Wrong file? Upload a new one to replace it.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="mt-1 text-sm text-vw-grey">
                                            Upload your transfer proof.
                                        </p>
                                    )}
                                    <form
                                        onSubmit={handleReceiptUpload}
                                        className="mt-3 flex flex-col gap-2"
                                    >
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="w-full min-w-0 rounded-xl border border-vw-grey/20 p-1.5 text-xs text-vw-grey file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-vw-grey-light file:px-3 file:py-2.5 file:text-xs file:font-semibold file:text-gray-900 hover:file:bg-vw-grey/20"
                                            onChange={(e) => setReceiptFile(e.target.files[0])}
                                        />
                                        <button
                                            type="submit"
                                            disabled={uploadingReceipt || !receiptFile}
                                            className="inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full bg-vw-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-vw-blue/90 disabled:bg-vw-grey/20 disabled:text-vw-grey disabled:shadow-none"
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
    const pendingList = orderedItems.filter(isServerPending);
    const decidedList = orderedItems.filter((item) => !isServerPending(item));
    const itemsList = (
        <>
            {pendingList.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {pendingList.map((item) => (
                        <InspectionItemCard
                            key={item.id}
                            item={item}
                            canDecide={canDecide}
                            onDecision={handleDecision}
                            onUndoLocal={handleCancelDecision}
                        />
                    ))}
                </ul>
            )}
            {decidedList.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-sm font-bold text-gray-900">Already decided</h3>
                    <ul className="mt-3 space-y-2">
                        {decidedList.map((item) => (
                            <DecidedItemRow
                                key={item.id}
                                item={item}
                                canCancel={canDecide && (localDecisionIds.has(item.id) || canUndoSubmitted)}
                                onCancel={handleCancelDecision}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </>
    );

    return (
        <PublicLayout>
            <Head title="Inspection Report" />

            <div className={`min-h-screen bg-gradient-to-b from-white via-vw-blue/[0.04] to-vw-blue/[0.07] ${canDecide ? 'pb-28' : 'pb-24'}`}>
                {/* Hero navy: logo + ilustrasi tahap. Kartu progress menimpa bagian bawahnya. */}
                <header className="relative mx-auto max-w-3xl px-5 pb-2 pt-5 sm:px-8 xl:max-w-4xl">
                    <div className="relative flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 rounded-lg bg-white ring-1 ring-vw-grey/15">
                            <AvatarImage src="/images/vw-logo-navy.jpeg" alt={workshopName} className="object-contain p-0.5" />
                            <AvatarFallback className="rounded-lg bg-white text-xs font-bold text-vw-blue">
                                {initials(workshopName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-vw-blue">{workshopName}</p>
                            <p className="truncate text-xs text-vw-grey">Service Inspection Report</p>
                        </div>
                    </div>
                    <StageIllustration step={isCancelled ? null : currentStep} />
                </header>

                <div className="relative mx-auto mt-4 max-w-3xl px-4 sm:px-8 xl:max-w-4xl">
                    {isCancelled ? (
                        <div className="rounded-2xl bg-white p-5 text-sm font-medium text-vw-grey shadow-lg ring-1 ring-vw-grey/10">
                            This order has been cancelled.
                        </div>
                    ) : (
                        currentStep && (
                            <div className="rounded-3xl bg-vw-blue p-4 text-white shadow-lg shadow-vw-blue/20">
                                <div className="flex items-center gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-white">Current progress</p>
                                        <p className="text-xs text-white/70">
                                            Step {currentStepIndex + 1} of {STATUS_STEPS.length}
                                        </p>
                                    </div>
                                </div>

                                <p className="mt-3 text-xl font-bold leading-tight text-white">{currentStep.label}</p>

                                <div
                                    className="mt-3 flex gap-1.5"
                                    role="progressbar"
                                    aria-label="Service progress"
                                    aria-valuemin={1}
                                    aria-valuemax={STATUS_STEPS.length}
                                    aria-valuenow={currentStepIndex + 1}
                                >
                                    {STATUS_STEPS.map((step, idx) => (
                                        <div
                                            key={step.key}
                                            className={`h-1.5 flex-1 rounded-full ${idx <= currentStepIndex ? 'bg-white' : 'bg-white/25'}`}
                                        />
                                    ))}
                                </div>

                                <div className="mt-3 flex justify-between gap-4 text-xs">
                                    <div>
                                        {prevStep && (
                                            <>
                                                <p className="font-bold text-white">{prevStep.label}</p>
                                                <p className="text-white/70">Done</p>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        {nextStep && (
                                            <>
                                                <p className="font-bold text-white">{nextStep.label}</p>
                                                <p className="text-white/70">Next</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>

                <div className="mx-auto max-w-3xl px-4 sm:px-8 xl:max-w-4xl">
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="min-w-0 rounded-xl bg-vw-grey-light/70 px-4 py-3">
                            <p className="text-xs text-vw-grey">License Number</p>
                            <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{vehicle.plate_number}</p>
                        </div>
                        <div className="min-w-0 rounded-xl bg-vw-grey-light/70 px-4 py-3">
                            <p className="text-xs text-vw-grey">Customer</p>
                            <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{customer.name}</p>
                        </div>
                    </div>

                    {canDecide && pendingItems.length > 0 && (
                        <button
                            type="button"
                            onClick={() => itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="group mt-3 flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-[13px] font-semibold text-amber-900 shadow-sm transition active:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
                        >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                <Clock className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                                {pendingItems.length} {pendingItems.length === 1 ? 'item' : 'items'} to decide
                            </span>
                            <span className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-full bg-amber-700 px-3 text-[13px] font-bold text-white group-active:bg-amber-800">
                                Review
                                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </button>
                    )}

                    {isInvoiceStage && (
                        <div className="mt-8 [&>*:first-child]:hidden">
                            {invoiceBlock}
                            {paymentBlock}
                        </div>
                    )}

                    {/* Video — kriteria #5: 1 slot saja, tidak ada tab pilihan part. */}
                    <section className="mt-8">
                        <h2 className="text-base font-bold text-gray-900">Inspection video</h2>

                        {video ? (
                            embedUrl ? (
                                <div className="mt-3 aspect-video overflow-hidden rounded-2xl">
                                    <iframe
                                        src={embedUrl}
                                        title="Inspection video"
                                        className="h-full w-full"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            ) : (
                                <video src={video.video_url} controls playsInline preload="metadata" className="mt-3 aspect-video w-full rounded-2xl bg-black" />
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
                                    <AvatarFallback className="bg-vw-blue text-[11px] font-semibold text-white">
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

                    <div className="my-6" />

                                        {/* Inspection Items — REDESIGN v3: grouping visual (Safety/Durability/dst)
                        SENGAJA DILEPAS — customer awam tidak familiar dengan istilah grup
                        internal itu. Sebagai gantinya: item pending selalu naik ke atas
                        (orderedItems), kartu pending dibuat tipis+ringkas, item yang sudah
                        diputuskan menciut jadi 1 baris (DecidedItemRow), dan ada sticky bottom bar (progress
                        + total + tombol Submit) supaya customer tidak perlu scroll ke bawah. */}
                    <section ref={itemsSectionRef} className="scroll-mt-20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-base font-bold text-gray-900">Inspection items</h2>
                            <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset
                                    ${isPricingFinal ? 'bg-approved/10 text-approved ring-approved/25' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}
                            >
                                {isPricingFinal ? 'Final Price' : 'Estimated Price'}
                            </span>
                        </div>

                        {isLocked && !hasPendingItems && (
                            <p className="mt-3 rounded-lg bg-vw-grey-light px-3.5 py-2 text-[13px] font-medium text-gray-700">
                                {canDecide && canUndoSubmitted
                                    ? 'All items decided. You can change them until quality control.'
                                    : canDecide
                                        ? 'All items decided.'
                                        : 'All items decided. Changes are no longer possible.'}
                            </p>
                        )}
                        {isLocked && hasPendingItems && !canDecide && (
                            <p className="mt-3 rounded-lg bg-vw-grey-light px-3.5 py-2 text-[13px] font-medium text-gray-700">
                                This report no longer accepts decisions.
                            </p>
                        )}

                        {collapseItems ? (
                            <Accordion type="single" collapsible className="mt-4">
                                <AccordionItem value="items" className={`px-4 ${SOFT_CARD}`}>
                                    <AccordionTrigger className="min-h-[48px] text-sm font-semibold text-gray-900">
                                        Inspection items ({items.length})
                                    </AccordionTrigger>
                                    <AccordionContent>{itemsList}</AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        ) : (
                            itemsList
                        )}

                        {/* Order summary */}
                        <div className={`mt-8 p-5 ${SOFT_CARD}`}>
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-base font-bold text-gray-900">Order summary</h3>
                            </div>

                            <dl className="mt-4 space-y-3 text-sm">
                                {totalDiscount > 0 && (
                                    <>
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-vw-grey">Price before discount</dt>
                                            <dd className="font-semibold text-gray-900"><Rupiah value={listTotal} /></dd>
                                        </div>
                                        {inspectionFeeRow}
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-vw-grey">Discount</dt>
                                            <dd className="whitespace-nowrap font-semibold text-approved">−<Rupiah value={totalDiscount} /></dd>
                                        </div>
                                    </>
                                )}
                                {totalDiscount <= 0 && inspectionFeeRow}
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-vw-grey">Subtotal</dt>
                                    <dd className="font-semibold text-gray-900"><Rupiah value={subtotal} /></dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-vw-grey">VAT ({vatPercent}%)</dt>
                                    <dd className="font-semibold text-gray-900"><Rupiah value={vatAmount} /></dd>
                                </div>
                            </dl>

                            <div className="my-4 border-t border-dashed border-vw-grey/30" />

                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-bold text-gray-900">
                                    {isPricingFinal ? 'Final total' : 'Estimated total'}
                                </span>
                                <Rupiah value={grandTotal + inspectionFee} className="text-2xl font-bold text-vw-blue" />
                            </div>
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
                            <div className="my-6" />
                            <section>
                                <SectionTitle count={estimationDocuments?.length ?? 0}>Estimation form</SectionTitle>
                                <div className="mt-3">
                                    {estimationDocuments?.length > 0 ? (
                                        <div className="space-y-3">
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
                            <div className="my-6" />
                            <section>
                                <div className={`p-5 text-center ${SOFT_CARD}`}>
                                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-approved/10">
                                        <CheckCircle2 className="h-5 w-5 text-approved" />
                                    </span>
                                    <h2 className="mt-3 text-base font-bold text-gray-900">Thank You!</h2>
                                    <p className="mt-1 text-sm text-gray-700">
                                        Thank you for trusting {workshopName} with your vehicle service. We hope to see you again soon.
                                    </p>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {settings.era_phone && (
                                        <a href={`tel:${settings.era_phone.replace(/[^\d+]/g, '')}`} className="flex min-h-[56px] items-center gap-3 rounded-3xl bg-vw-blue p-4 text-sm text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                                                <Phone className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-semibold text-white">Emergency Road Assist (ERA)</span>
                                                <span className="text-xs tabular-nums text-white/80">{settings.era_phone}</span>
                                            </span>
                                        </a>
                                    )}
                                    {bookingWaHref && (
                                        <a
                                            href={bookingWaHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex min-h-[56px] items-center gap-3 rounded-3xl bg-vw-blue p-4 text-sm text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90"
                                        >
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                                                <WhatsAppIcon className="h-5 w-5" />
                                            </span>
                                            <span>
                                                <span className="block font-semibold text-white">Book your next service</span>
                                                <span className="text-xs text-white/80">Chat with us on WhatsApp</span>
                                            </span>
                                        </a>
                                    )}
                                    {settings.survey_form_url && (
                                        <a
                                            href={settings.survey_form_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-vw-blue px-4 text-sm font-semibold text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90"
                                        >
                                            Share Your Feedback
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    )}
                                </div>
                            </section>
                        </>
                    )}

                    <div className="my-6" />

                    {/* Contact SA — foto SA yang diupload admin, dengan fallback inisial. */}
                    <section>
                        <div className={`p-4 ${SOFT_CARD}`}>
                            <div className="flex items-center gap-3">
                                <Avatar className="h-11 w-11 shrink-0">
                                    <AvatarImage
                                        src={serviceAdvisor.photo_path ? `/storage/${serviceAdvisor.photo_path}` : undefined}
                                        alt={serviceAdvisor.name}
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-vw-blue text-xs font-bold text-white">
                                        {initials(serviceAdvisor.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-gray-900">{serviceAdvisor.name}</p>
                                    <p className="truncate text-xs text-vw-grey">Service Advisor</p>
                                </div>
                            </div>
                            {(waHref || serviceAdvisor.email) && (
                                <div className={`mt-4 grid gap-2 ${waHref && serviceAdvisor.email ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {waHref && (
                                        <a
                                            href={waHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-vw-blue px-3 text-xs font-semibold text-white transition hover:bg-vw-blue/90"
                                        >
                                            <WhatsAppIcon className="h-4 w-4" />
                                            WhatsApp
                                        </a>
                                    )}
                                    {serviceAdvisor.email && (
                                        <a
                                            href={`mailto:${serviceAdvisor.email}`}
                                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-vw-grey-light px-3 text-xs font-semibold text-gray-900 transition hover:bg-vw-grey/20"
                                        >
                                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                            Email
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="my-6" />

                    {/* Workshop location — alamat menimpa peta; tombol aksi hanya tampil kalau datanya ada. */}
                    <section className={`p-5 ${SOFT_CARD}`}>
                        <h2 className="text-base font-bold text-gray-900">Workshop location</h2>
                        <div className="relative mt-3 overflow-hidden rounded-2xl bg-vw-grey-light/70">
                            {settings.google_maps_embed_url ? (
                                <iframe
                                    src={settings.google_maps_embed_url}
                                    width="100%"
                                    height="220"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    title="Workshop location map"
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    className="block w-full"
                                />
                            ) : (
                                <div className="h-44 w-full" aria-hidden="true" />
                            )}
                            <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-md ring-1 ring-black/[0.04]">
                                <MapPin className="h-4 w-4 shrink-0 text-vw-blue" aria-hidden="true" />
                                <p className="min-w-0 text-xs font-semibold text-gray-900">{settings.address ?? '[Address]'}</p>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {settings.google_maps_url && (
                                <a href={settings.google_maps_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-vw-grey/30 px-4 text-xs font-semibold text-gray-900 transition hover:bg-vw-grey-light">
                                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                    Open in Maps
                                </a>
                            )}
                            {settings.website_url && (
                                <a href={settings.website_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-vw-grey/30 px-4 text-xs font-semibold text-gray-900 transition hover:bg-vw-grey-light">
                                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                                    Visit Website
                                </a>
                            )}
                            {bookingWaHref && (
                                <a href={bookingWaHref} target="_blank" rel="noopener noreferrer"
                                    className="col-span-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-vw-blue px-4 text-xs font-semibold text-vw-blue transition hover:bg-vw-blue hover:text-white">
                                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    Book a service
                                </a>
                            )}
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
                    className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-vw-grey/15 bg-white/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3 sm:px-8 xl:max-w-4xl">
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
                            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-vw-blue px-6 text-sm font-semibold text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90 disabled:cursor-not-allowed disabled:bg-vw-grey/30 disabled:text-vw-grey disabled:shadow-none"
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

                    <ul className="-mx-1 mt-4 max-h-52 space-y-2.5 overflow-y-auto px-1 pb-2 pt-1">
                        {decidedThisRound.map((item) => {
                            const ok = item.status === 'approved';
                            return (
                                <li
                                    key={item.id}
                                    className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 ring-1 ring-black/[0.04] shadow-[0_10px_30px_-16px_rgba(22,27,89,0.22)]"
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
                        <div className={`mt-4 p-5 ${SOFT_CARD}`}>
                            <h3 className="text-base font-bold text-gray-900">Summary</h3>
                            <dl className="mt-4 space-y-3 text-sm">
                                {decidedDiscount > 0 && (
                                    <>
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-vw-grey">Price before discount</dt>
                                            <dd className="font-semibold text-gray-900"><Rupiah value={decidedListTotal} /></dd>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <dt className="text-vw-grey">Discount</dt>
                                            <dd className="whitespace-nowrap font-semibold text-approved">−<Rupiah value={decidedDiscount} /></dd>
                                        </div>
                                    </>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-vw-grey">Subtotal</dt>
                                    <dd className="font-semibold text-gray-900"><Rupiah value={decidedApprovedSubtotal} /></dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-vw-grey">VAT ({vatPercent}%)</dt>
                                    <dd className="font-semibold text-gray-900"><Rupiah value={decidedApprovedTotal - decidedApprovedSubtotal} /></dd>
                                </div>
                            </dl>

                            <div className="my-4 border-t border-dashed border-vw-grey/30" />

                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-bold text-gray-900">Total (this submission)</span>
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