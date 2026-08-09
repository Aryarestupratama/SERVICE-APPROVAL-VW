import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { Phone, Mail, MessageCircle, FileText, CheckCircle2, ExternalLink, Sparkles, MapPin, Globe } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/Components/ui/avatar';
import { Separator } from '@/Components/ui/separator';
import { Progress } from '@/Components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/Components/ui/sheet';

function StatusStamp({ status }) {
    if (status === 'pending') {
        return (
            <span className="inline-flex items-center rounded-sm border border-vw-grey/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vw-grey">
                Waiting Approval
            </span>
        );
    }
    const isApproved = status === 'approved';
    return (
        <span
            className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
                ${isApproved ? 'border-approved text-approved' : 'border-vw-grey text-vw-grey'}`}
        >
            {isApproved ? 'Approved' : 'Rejected'}
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

// Urutan tampil grouping — kriteria #8: grouping berurutan dari Related
// paling atas sampai Appearance paling bawah, BUKAN badge per item lagi.
const GROUP_ORDER = ['related', 'safety', 'durability', 'experience', 'appearance'];

const STATUS_STEPS = [
    { key: 'appointment', label: 'Appointment' },
    { key: 'work_in_progress', label: 'In Progress' },
    { key: 'quality_control', label: 'Quality Control' },
    { key: 'invoice_preparation', label: 'Invoice' },
    { key: 'completed', label: 'Completed' },
];

function groupItems(items) {
    const buckets = {};
    for (const item of items) {
        const key = item.group ?? 'related';
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(item);
    }
    // Group tak dikenal (bukan bagian dari GROUP_ORDER) ditaruh di akhir,
    // bukan hilang — supaya tidak ada item yang "kepotong" diam-diam.
    const knownOrder = GROUP_ORDER.filter((g) => buckets[g]);
    const unknownOrder = Object.keys(buckets).filter((g) => !GROUP_ORDER.includes(g));
    return [...knownOrder, ...unknownOrder].map((key) => ({ key, items: buckets[key] }));
}

const ESTIMATION_VISIBLE_STATUSES = ['work_in_progress'];
const DECIDABLE_STATUSES = ['appointment', 'work_in_progress'];
const INVOICE_VISIBLE_STATUSES = ['quality_control', 'invoice_preparation', 'completed'];
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
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [receiptFile, setReceiptFile] = useState(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);

    // Kriteria #5: cuma ada 1 video sekarang, tidak ada lagi tab/pilihan part.
    const video = videos?.[0] ?? null;
    const embedUrl = video ? youtubeEmbedUrl(video.video_url) : null;

    const canDecide = DECIDABLE_STATUSES.includes(order.status);
    const pendingItems = items.filter((item) => item.status === 'pending');
    const hasPendingItems = pendingItems.length > 0;
    const isLocked = !canDecide || !hasPendingItems;

    const decidedThisRound = items.filter(
        (item, idx) => item.status !== 'pending' && initialItems[idx]?.status === 'pending'
    );
    const hasDecisionToSubmit = decidedThisRound.length > 0;

    const vatPercent = Number(settings.ppn_percent ?? 0);
    const subtotal = items
        .filter((item) => item.status !== 'rejected')
        .reduce((sum, item) => sum + itemSubtotal(item), 0);
    const vatAmount = subtotal * (vatPercent / 100);
    const grandTotal = subtotal + vatAmount;

    const decidedApprovedSubtotal = decidedThisRound
        .filter((item) => item.status === 'approved')
        .reduce((sum, item) => sum + itemSubtotal(item), 0);
    const decidedApprovedTotal = decidedApprovedSubtotal * (1 + vatPercent / 100);

    const handleDecision = (itemId, decision) => {
        setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, status: decision } : item)));
    };

    const handleConfirmSubmit = () => {
        setSubmitting(true);
        router.post(
            route('public.report.decide', token),
            { decisions: decidedThisRound.map((item) => ({ id: item.id, status: item.status })) },
            {
                onSuccess: () => setShowModal(false),
                onError: () => setShowModal(false),
                onFinish: () => setSubmitting(false),
            }
        );
    };

    const waHref = serviceAdvisor.phone ? `https://wa.me/${serviceAdvisor.phone.replace(/\D/g, '')}` : null;
    const bookingWaHref = settings.booking_whatsapp_phone
        ? `https://wa.me/${settings.booking_whatsapp_phone.replace(/\D/g, '')}`
        : null;

    const showEstimationSection = ESTIMATION_VISIBLE_STATUSES.includes(order.status);
    const showInvoiceSection = INVOICE_VISIBLE_STATUSES.includes(order.status);
    const isPricingFinal = FINAL_PRICING_STATUSES.includes(order.status);
    const showPaymentSection = order.status === 'invoice_preparation';
    const showThankYouSection = THANK_YOU_VISIBLE_STATUSES.includes(order.status);

    const BANK_ACCOUNTS = [
        { bank: 'Bank Mandiri IDR', account: 'PT Wahana Wirawan — No. A/C 1240012993409' },
        { bank: 'Bank Central Asia IDR', account: 'PT Wahana Wirawan — No. A/C 7160263789' },
    ];

    const handleReceiptUpload = (e) => {
        e.preventDefault();
        if (!receiptFile) return;
        setUploadingReceipt(true);
        router.post(
            route('public.report.upload-payment-receipt', token),
            { receipt: receiptFile },
            {
                forceFormData: true,
                onSuccess: () => setReceiptFile(null),
                onFinish: () => setUploadingReceipt(false),
            }
        );
    };

    const groupedItems = groupItems(items);
    const workshopName = settings.workshop_name ?? 'Volkswagen PIK';

    const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
    const isCancelled = order.status === 'all_rejected_cancelled';
    const progressValue = currentStepIndex >= 0 ? ((currentStepIndex + 1) / STATUS_STEPS.length) * 100 : 0;

    return (
        <PublicLayout>
            <Head title="Inspection Report" />

            <div className="min-h-screen bg-white pb-24">
                {/* Navbar — kriteria #1: nama VW PIK + logo, terpisah dari hero. */}
                <header className="sticky top-0 z-40 border-b border-vw-grey/10 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3 sm:px-10 lg:px-16 xl:max-w-4xl xl:px-24">
                        <Avatar className="h-9 w-9 shrink-0 rounded-sm">
                            <AvatarImage src={settings.logo_path ? `/storage/${settings.logo_path}` : undefined} alt={workshopName} className="object-contain" />
                            <AvatarFallback className="rounded-sm bg-vw-blue text-xs font-bold text-white">
                                {initials(workshopName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-gray-900">{workshopName}</p>
                            <p className="text-[10px] uppercase tracking-widest text-vw-grey">Service Inspection Report</p>
                        </div>
                    </div>
                </header>

                {/* Hero image — kriteria #2 & #3: gambar dari upload Settings, ganti-ganti tanpa sentuh kode.
                    Kriteria #13: tidak ada lagi "Report No." di sini. */}
                <section className="relative mx-auto mt-4 max-w-3xl overflow-hidden sm:rounded-lg xl:max-w-4xl xl:mx-auto xl:px-24">
                    <div className="relative aspect-[16/7] w-full overflow-hidden sm:rounded-lg">
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
                        <div className="absolute inset-x-0 bottom-0 px-6 pb-5 sm:px-8">
                            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                Vehicle Inspection Report
                            </h1>
                            <p className="mt-0.5 text-sm text-white/80">
                                Prepared for {customer.name}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Status progress — kriteria opsional: step indicator 5 tahap. */}
                <section className="mt-6 px-6 sm:px-10 xl:mx-auto xl:max-w-4xl xl:px-24">
                    {isCancelled ? (
                        <div className="flex items-center gap-2 rounded-md border border-vw-grey/20 bg-vw-grey-light px-4 py-2.5 text-sm font-medium text-vw-grey">
                            This order has been cancelled.
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-1">
                                {STATUS_STEPS.map((step, idx) => (
                                    <span
                                        key={step.key}
                                        className={`text-center text-[9px] font-bold uppercase leading-tight tracking-wider sm:text-[10px] sm:tracking-wider
                                            ${idx <= currentStepIndex ? 'text-vw-blue' : 'text-vw-grey/50'}`}
                                    >
                                        {step.label}
                                    </span>
                                ))}
                            </div>
                            <Progress value={progressValue} className="mt-2 h-1.5" />
                        </>
                    )}
                </section>

                <div className="mx-auto max-w-3xl px-6 sm:px-10 xl:max-w-4xl xl:px-24">
                    {/* Vehicle & customer strip — kriteria #4: License Number, bukan Plate Number. */}
                    <div className="-mt-4 grid grid-cols-2 gap-3 sm:mt-6">
                        <div className="rounded-md border border-vw-grey/15 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-vw-grey">License Number</p>
                            <p className="mt-0.5 font-mono text-sm font-semibold text-gray-900">{vehicle.plate_number}</p>
                        </div>
                        <div className="rounded-md border border-vw-grey/15 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-vw-grey">Customer</p>
                            <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{customer.name}</p>
                        </div>
                    </div>

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
                                <video src={video.video_url} controls className="mt-3 aspect-video w-full rounded-md bg-black" />
                            )
                        ) : (
                            <p className="mt-3 text-sm text-vw-grey">No video available yet.</p>
                        )}

                        {/* Kriteria #6: pesan dari Kepala Teknisi, bukan generic. */}
                        {order.personal_message && (
                            <div className="mt-4 flex gap-3 rounded-md bg-vw-grey-light px-4 py-3">
                                <Avatar className="h-9 w-9 shrink-0">
                                    <AvatarFallback className="bg-vw-blue text-xs font-bold text-white">
                                        {initials(chiefTechnician?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="text-sm italic text-gray-700">"{order.personal_message}"</p>
                                    <p className="mt-1 text-xs font-semibold text-vw-grey">
                                        — {chiefTechnician?.name ?? 'Chief Technician'}, Chief Technician
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>

                    <Separator className="my-8" />

                    {order.status === 'quality_control' && (
                        <>
                            <section>
                                <div className="flex items-center gap-4 rounded-md border border-vw-blue/20 bg-vw-blue/5 px-5 py-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-vw-blue/10">
                                        <Sparkles className="h-5 w-5 text-vw-blue" />
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">
                                            Your vehicle is being checked and washed
                                        </p>
                                        <p className="mt-0.5 text-xs text-vw-grey">
                                            Final quality control is in progress. We'll notify you once the invoice is ready.
                                        </p>
                                    </div>
                                </div>
                            </section>
                            <Separator className="my-8" />
                        </>
                    )}

                    {/* Inspection Items — kriteria #7 & #8: grouping beneran (bukan badge),
                        urut Related → Safety → Durability → Experience → Appearance. */}
                    <section>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Inspection Items</h2>
                            <span
                                className={`rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
                                    ${isPricingFinal ? 'bg-approved/10 text-approved' : 'bg-amber-100 text-amber-700'}`}
                            >
                                {isPricingFinal ? 'Final Price' : 'Estimated Price'}
                            </span>
                        </div>

                        {isLocked && !hasPendingItems && (
                            <p className="mt-3 rounded-md bg-vw-grey-light px-4 py-2 text-sm font-medium text-gray-700">
                                All items have been decided for this report.
                            </p>
                        )}
                        {isLocked && hasPendingItems && !canDecide && (
                            <p className="mt-3 rounded-md bg-vw-grey-light px-4 py-2 text-sm font-medium text-gray-700">
                                This report is no longer accepting new decisions.
                            </p>
                        )}

                        <div className="mt-4 space-y-6">
                            {groupedItems.map(({ key, items: groupItemsList }) => (
                                <div key={key}>
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-vw-blue">
                                        {GROUP_LABEL[key] ?? key}
                                    </h3>
                                    <div className="mt-2 divide-y divide-vw-grey-light border-y border-vw-grey-light">
                                        {groupItemsList.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-medium text-gray-900">{item.name}</span>
                                                        <StatusStamp status={item.status} />
                                                    </div>
                                                    {item.description && (
                                                        <p className="mt-0.5 text-sm text-vw-grey">{item.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end sm:text-right">
                                                    <p className="font-mono text-sm font-semibold text-gray-900">
                                                        Rp {itemDisplayPrice(item).toLocaleString('id-ID')}
                                                    </p>
                                                    {canDecide && item.status === 'pending' && (
                                                        <div className="flex gap-2 sm:mt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDecision(item.id, 'approved')}
                                                                className="min-h-[44px] flex-1 rounded-sm border border-approved px-3 text-xs font-semibold text-approved hover:bg-approved hover:text-white sm:min-h-0 sm:flex-none sm:py-1"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDecision(item.id, 'rejected')}
                                                                className="min-h-[44px] flex-1 rounded-sm border border-vw-grey px-3 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white sm:min-h-0 sm:flex-none sm:py-1"
                                                            >
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 space-y-1.5">
                            <div className="flex items-center justify-between text-sm text-vw-grey">
                                <span>Subtotal</span>
                                <span className="font-mono text-gray-700">Rp {subtotal.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm text-vw-grey">
                                <span>VAT ({vatPercent}%)</span>
                                <span className="font-mono text-gray-700">Rp {vatAmount.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-vw-grey-light pt-1.5">
                                <span className="text-sm font-semibold uppercase tracking-wide text-vw-grey">
                                    {isPricingFinal ? 'Final Total' : 'Estimated Total'}
                                </span>
                                <span className="font-mono text-lg font-bold text-vw-blue">
                                    Rp {grandTotal.toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>

                        {!isPricingFinal && (
                            <p className="mt-2 text-xs italic text-vw-grey">
                                These prices are estimates and may change until finalized after inspection review.
                            </p>
                        )}

                        {canDecide && hasDecisionToSubmit && (
                            <button
                                type="button"
                                onClick={() => setShowModal(true)}
                                className="mt-6 w-full rounded-md bg-vw-blue py-3 text-sm font-semibold text-white transition-colors hover:bg-vw-blue/90"
                            >
                                Submit Decision
                            </button>
                        )}
                        {canDecide && hasPendingItems && !hasDecisionToSubmit && (
                            <p className="mt-2 text-center text-xs text-vw-grey">
                                You can decide on some items now and come back later for the rest.
                            </p>
                        )}
                    </section>

                    {/* Kriteria #9: section kondisional tetap ikut arahan status yang sudah ada. */}
                    {showEstimationSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Estimation Form</h2>
                                {estimationDocuments?.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {estimationDocuments.map((doc) => (
                                            <a
                                                key={doc.id}
                                                href={`/storage/${doc.pdf_path}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:bg-vw-blue/[0.03] hover:text-vw-blue"
                                            >
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                                    <FileText className="h-4 w-4" />
                                                </span>
                                                <span>
                                                    <span className="block font-medium text-gray-900">
                                                        {GROUP_LABEL[doc.group] ?? doc.group} Estimation (PDF)
                                                    </span>
                                                    <span className="text-xs text-vw-grey">Opens in a new tab</span>
                                                </span>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-3 rounded-md bg-vw-grey-light px-4 py-2 text-sm text-vw-grey">
                                        Estimation form is being prepared and will appear here shortly.
                                    </p>
                                )}
                            </section>
                        </>
                    )}

                    {showInvoiceSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Invoice Form</h2>
                                {invoice ? (
                                    <div className="mt-3">
                                        <a
                                            href={`/storage/${invoice.file_path}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:bg-vw-blue/[0.03] hover:text-vw-blue"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                                <FileText className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-medium text-gray-900">View Invoice (PDF)</span>
                                                <span className="text-xs text-vw-grey">Opens in a new tab</span>
                                            </span>
                                        </a>
                                    </div>
                                ) : (
                                    <p className="mt-3 rounded-md bg-vw-grey-light px-4 py-2 text-sm text-vw-grey">
                                        Invoice is being prepared and will appear here shortly.
                                    </p>
                                )}
                            </section>
                        </>
                    )}

                    {showPaymentSection && (
                        <>
                            <Separator className="my-8" />
                            <section>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Payment</h2>
                                <div className="mt-3 space-y-2">
                                    {BANK_ACCOUNTS.map((acc) => (
                                        <div key={acc.bank} className="rounded-md border border-vw-grey/15 px-4 py-3 text-sm">
                                            <p className="font-semibold text-gray-900">{acc.bank}</p>
                                            <p className="text-vw-grey">{acc.account}</p>
                                        </div>
                                    ))}
                                </div>
                                {(order.invoice_number || order.bill_to) && (
                                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                                        {order.invoice_number && <p>Invoice Number: {order.invoice_number}</p>}
                                        {order.bill_to && <p>Bill To: {order.bill_to}</p>}
                                    </div>
                                )}
                                <div className="mt-4">
                                    <p className="text-sm font-medium text-gray-900">Upload your payment receipt</p>
                                    {customerPaymentReceipt ? (
                                        <p className="mt-1 text-sm text-approved">
                                            Receipt already uploaded — you can upload again to replace it.
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-sm text-vw-grey">No receipt uploaded yet.</p>
                                    )}
                                    <form
                                        onSubmit={handleReceiptUpload}
                                        className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
                                    >
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="w-full text-xs sm:w-auto"
                                            onChange={(e) => setReceiptFile(e.target.files[0])}
                                        />
                                        <button
                                            type="submit"
                                            disabled={uploadingReceipt || !receiptFile}
                                            className="w-full shrink-0 rounded-md bg-vw-blue px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-vw-blue/90 disabled:opacity-50 sm:w-auto"
                                        >
                                            {uploadingReceipt ? 'Uploading...' : 'Upload'}
                                        </button>
                                    </form>
                                </div>
                            </section>
                        </>
                    )}

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
                                        <div className="flex items-center gap-3 rounded-md border border-vw-grey/15 px-4 py-3 text-sm text-gray-700">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                                <Phone className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-medium text-gray-900">Emergency Road Assist (ERA)</span>
                                                <span className="font-mono text-xs text-vw-grey">{settings.era_phone}</span>
                                            </span>
                                        </div>
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
                                            className="flex items-center justify-center gap-2 rounded-md bg-vw-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-vw-blue/90"
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
                                    <p className="mt-1.5 text-sm font-semibold text-gray-900">Waiting on your response</p>
                                    <p className="mt-0.5 text-xs text-vw-grey">Have questions? Reach out to your service advisor.</p>
                                </div>
                                <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-vw-blue px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-vw-blue/90 sm:w-auto"
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
                                <Avatar className="h-12 w-12">
                                    <AvatarImage
                                        src={serviceAdvisor.photo_path ? `/storage/${serviceAdvisor.photo_path}` : undefined}
                                        alt={serviceAdvisor.name}
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-vw-blue text-sm font-bold text-white">
                                        {initials(serviceAdvisor.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium text-gray-900">{serviceAdvisor.name}</p>
                                    <p className="text-sm text-vw-grey">Service Advisor</p>
                                </div>
                            </div>

                            <div className="mt-3 space-y-2">
                                {serviceAdvisor.phone && (
                                    <a
                                        href={waHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2.5 rounded-md border border-vw-grey/15 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:text-vw-blue"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                            <Phone className="h-4 w-4" />
                                        </span>
                                        <span className="font-mono">{serviceAdvisor.phone}</span>
                                    </a>
                                )}
                                <a
                                    href={`mailto:${serviceAdvisor.email}`}
                                    className="flex items-center gap-2.5 rounded-md border border-vw-grey/15 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-vw-blue hover:text-vw-blue"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-vw-grey-light">
                                        <Mail className="h-4 w-4" />
                                    </span>
                                    <span className="truncate font-mono">{serviceAdvisor.email}</span>
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
                                <p className="text-sm text-gray-700">{settings.address ?? '[Address]'}</p>
                            </div>

                            {settings.google_maps_embed_url && (
                                <iframe
                                    src={settings.google_maps_embed_url}
                                    width="100%"
                                    height="180"
                                    style={{ border: 0 }}
                                    allowFullScreen=""
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    className="mt-3 rounded-md border border-vw-grey/15"
                                />
                            )}

                            <div className="mt-3 flex flex-wrap gap-2">
                                {settings.google_maps_url && (
                                    <a
                                        href={settings.google_maps_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-md border border-vw-grey px-4 py-2 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
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
                                        className="inline-flex items-center gap-1.5 rounded-md border border-vw-grey px-4 py-2 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
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
                                        className="inline-flex items-center gap-1.5 rounded-md border border-vw-blue px-4 py-2 text-xs font-semibold text-vw-blue hover:bg-vw-blue hover:text-white"
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

            {/* Modal konfirmasi final — tidak berubah dari sebelumnya. */}
            <Sheet open={showModal} onOpenChange={setShowModal}>
                <SheetContent side="bottom" className="rounded-t-lg sm:mx-auto sm:max-w-sm">
                    <SheetHeader className="text-left">
                        <SheetTitle>Confirm your decision</SheetTitle>
                        <SheetDescription>
                            This action is final and cannot be changed afterwards for the items below.
                        </SheetDescription>
                    </SheetHeader>

                    <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                        {decidedThisRound.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate text-gray-700">{item.name}</span>
                                <StatusStamp status={item.status} />
                            </li>
                        ))}
                    </ul>

                    <div className="mt-4 space-y-1 border-t border-vw-grey-light pt-3">
                        <div className="flex items-center justify-between text-xs text-vw-grey">
                            <span>Subtotal</span>
                            <span className="font-mono">Rp {decidedApprovedSubtotal.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-vw-grey">
                            <span>VAT ({vatPercent}%)</span>
                            <span className="font-mono">
                                Rp {(decidedApprovedTotal - decidedApprovedSubtotal).toLocaleString('id-ID')}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-vw-grey">Total</span>
                            <span className="font-mono text-base font-bold text-vw-blue">
                                Rp {decidedApprovedTotal.toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>

                    <SheetFooter className="mt-5 flex-row gap-3 sm:flex-row">
                        <SheetClose asChild>
                            <button
                                type="button"
                                disabled={submitting}
                                className="min-h-[44px] flex-1 rounded-md border border-vw-grey text-sm font-semibold text-vw-grey"
                            >
                                Cancel
                            </button>
                        </SheetClose>
                        <button
                            type="button"
                            onClick={handleConfirmSubmit}
                            disabled={submitting}
                            className="min-h-[44px] flex-1 rounded-md bg-vw-blue text-sm font-semibold text-white transition-colors hover:bg-vw-blue/90 disabled:opacity-50"
                        >
                            {submitting ? 'Submitting...' : 'Confirm & Submit'}
                        </button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </PublicLayout>
    );
}