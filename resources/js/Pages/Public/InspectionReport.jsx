import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { Phone, Mail, MessageCircle, FileText, CheckCircle2, ExternalLink } from 'lucide-react';

function StatusStamp({ status }) {
    if (status === 'pending') {
        return (
            <span className="inline-flex -rotate-6 items-center rounded-full border-2 border-dashed border-vw-grey px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vw-grey">
                Waiting Approval
            </span>
        );
    }
    const isApproved = status === 'approved';
    return (
        <span
            className={`inline-flex -rotate-6 items-center rounded-full border-2 border-dashed px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider
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

// Estimation Form aktif hanya saat work_in_progress, Invoice Form aktif mulai
// quality_control/invoice_preparation/completed — sinkron dengan
// $showEstimationViewer / $showInvoiceViewer di controller.
const ESTIMATION_VISIBLE_STATUSES = ['work_in_progress'];

// Status di mana customer masih boleh submit keputusan.
// Selain ini (quality_control, invoice_preparation, completed, all_rejected_cancelled),
// order sudah lewat tahap negosiasi — form dikunci read-only.
const DECIDABLE_STATUSES = ['appointment', 'work_in_progress'];

// Status di mana section invoice viewer relevan ditampilkan — harus sinkron
// dengan $showInvoiceViewer di InspectionReportController::show().
const INVOICE_VISIBLE_STATUSES = ['quality_control', 'invoice_preparation', 'completed'];

// Harga baru dianggap final mulai quality_control (final_price_snapshot sudah
// terkunci untuk item approved). Sebelum itu (appointment/work_in_progress), harga
// yang ditampilkan masih estimasi karena customer masih bisa approve/reject.
const FINAL_PRICING_STATUSES = ['quality_control', 'invoice_preparation', 'completed'];

// Thank You section — muncul HANYA saat order sudah completed (PROJECT-RULES.md
// bagian 2, poin 9). Beda dengan CTA "Contact SA" yang khusus invoice_preparation.
const THANK_YOU_VISIBLE_STATUSES = ['completed'];

// Harga tampil per item: pakai final_price_snapshot kalau sudah terkunci
// (approved), kalau belum (pending/rejected) hitung on-the-fly dari
// cost_item/cost_labour dikurangi diskon masing-masing.
function itemDisplayPrice(item) {
    if (item.final_price_snapshot !== null && item.final_price_snapshot !== undefined) {
        return item.final_price_snapshot;
    }

    const itemAfterDiscount = item.cost_item * (1 - (item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount = item.cost_labour * (1 - (item.discount_labour_percent ?? 0) / 100);

    return itemAfterDiscount + labourAfterDiscount;
}

// Subtotal pre-VAT per item, dihitung dari raw fields — sama seperti admin
// Show.jsx, konsisten untuk item locked maupun belum.
function itemSubtotal(item) {
    const itemAfterDiscount = item.cost_item * (1 - (item.discount_item_percent ?? 0) / 100);
    const labourAfterDiscount = item.cost_labour * (1 - (item.discount_labour_percent ?? 0) / 100);

    return itemAfterDiscount + labourAfterDiscount;
}

// Convert berbagai format link YouTube (watch?v=, youtu.be/, sudah embed/)
// jadi URL embed yang valid untuk iframe. Return null kalau bukan YouTube
// atau tidak bisa di-parse (fallback ke <video> tag native).
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
                return url; // sudah embed URL
            }
        }

        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    } catch {
        return null;
    }
}

// "Invoice 1", "Invoice 2", dst — di-derive dari sort_order, sama pola dengan
// admin Show.jsx (belum ada kolom `label` tersendiri di service_order_invoices).
function sortedInvoices(invoices) {
    return [...(invoices ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

export default function InspectionReport({ token, settings, order, vehicle, customer, serviceAdvisor, videos, items: initialItems }) {
    const [activeVideo, setActiveVideo] = useState(videos[0]?.id ?? null);
    const [items, setItems] = useState(initialItems);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Order masih bisa terima keputusan customer selama statusnya appointment/work_in_progress
    // DAN masih ada item pending. Begitu order pindah status lain (SA sudah lanjutkan proses)
    // atau semua item sudah diputuskan, form dikunci.
    const canDecide = DECIDABLE_STATUSES.includes(order.status);
    const pendingItems = items.filter((item) => item.status === 'pending');
    const hasPendingItems = pendingItems.length > 0;
    const isLocked = !canDecide || !hasPendingItems;

    // Item yang baru saja diputuskan customer di sesi ini (belum submit) —
    // ini yang dikirim ke backend, BUKAN seluruh array items (sesuai bagian 7D:
    // "setiap submit hanya boleh berisi item yang SAAT ITU berstatus pending").
    const decidedThisRound = items.filter(
        (item, idx) => item.status !== 'pending' && initialItems[idx]?.status === 'pending'
    );
    const hasDecisionToSubmit = decidedThisRound.length > 0;

    // Breakdown VAT: filter sama seperti totalCost sebelumnya (exclude rejected),
    // subtotal pre-VAT lalu dikenakan settings.ppn_percent — pola yang sama
    // dengan backend InspectionItemPricingService.
    const vatPercent = Number(settings.ppn_percent ?? 0);
    const subtotal = items
        .filter((item) => item.status !== 'rejected')
        .reduce((sum, item) => sum + itemSubtotal(item), 0);
    const vatAmount = subtotal * (vatPercent / 100);
    const grandTotal = subtotal + vatAmount;

    // FIX #3: total khusus untuk modal konfirmasi — hanya item yang BARU
    // di-approve di sesi ini, bukan total keseluruhan order. Sekarang sudah
    // termasuk VAT, sama seperti Grand Total di section 3.
    const decidedApprovedSubtotal = decidedThisRound
        .filter((item) => item.status === 'approved')
        .reduce((sum, item) => sum + itemSubtotal(item), 0);
    const decidedApprovedTotal = decidedApprovedSubtotal * (1 + vatPercent / 100);

    const handleDecision = (itemId, decision) => {
        setItems((prev) =>
            prev.map((item) =>
                item.id === itemId ? { ...item, status: decision } : item
            )
        );
    };

    const handleConfirmSubmit = () => {
        setSubmitting(true);

        router.post(
            route('public.report.decide', token),
            {
                // Hanya kirim item yang baru diputuskan di sesi ini, bukan semua item.
                decisions: decidedThisRound.map((item) => ({
                    id: item.id,
                    status: item.status,
                })),
            },
            {
                onSuccess: () => {
                    setShowModal(false);
                },
                onError: () => {
                    setShowModal(false);
                },
                onFinish: () => setSubmitting(false),
            }
        );
    };

    const waHref = serviceAdvisor.phone
        ? `https://wa.me/${serviceAdvisor.phone.replace(/\D/g, '')}`
        : null;

    const bookingWaHref = settings.booking_whatsapp_phone
        ? `https://wa.me/${settings.booking_whatsapp_phone.replace(/\D/g, '')}`
        : null;

    // Section invoice hanya relevan mulai quality_control/invoice_preparation/
    // completed — daftar diambil dari order.invoices (relasi), bisa kosong
    // kalau SA belum sempat upload meski statusnya sudah masuk tahap ini.
    const showEstimationSection = ESTIMATION_VISIBLE_STATUSES.includes(order.status);
    const showInvoiceSection = INVOICE_VISIBLE_STATUSES.includes(order.status);
    const isPricingFinal = FINAL_PRICING_STATUSES.includes(order.status);
    const invoices = sortedInvoices(order.invoices);
    const showThankYouSection = THANK_YOU_VISIBLE_STATUSES.includes(order.status);

    return (
        <PublicLayout>
            <Head title="Inspection Report" />

            <div className="mx-auto max-w-2xl pb-24">
                {/* 1. Hero / Branding */}
                <section className="bg-vw-blue px-6 pb-10 pt-12 text-white">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-vw-light-blue">
                        Report No. {String(order.id).padStart(6, '0')}
                    </p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight">
                        {settings.workshop_name ?? '[Workshop Name]'}
                    </h1>
                    <p className="mt-1 text-sm text-white/70">Vehicle Inspection Report</p>
                </section>

                {/* 2. Video Personal */}
                <section className="px-6 pt-8">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">
                        Inspection Video
                    </h2>

                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-sm text-gray-700">
                        <span>
                            Plate <span className="font-semibold">{vehicle.plate_number}</span>
                        </span>
                        <span className="text-vw-grey">{customer.name}</span>
                    </div>

                    {videos.length > 0 && (
                        <div className="mt-4 flex gap-2 overflow-x-auto">
                            {videos.map((video) => (
                                <button
                                    key={video.id}
                                    type="button"
                                    onClick={() => setActiveVideo(video.id)}
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors
                                        ${activeVideo === video.id
                                            ? 'bg-vw-blue text-white'
                                            : 'bg-vw-grey-light text-vw-grey hover:bg-vw-grey-light/70'}`}
                                >
                                    {video.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {videos.length > 0 ? (
                        (() => {
                            const current = videos.find((v) => v.id === activeVideo);
                            const embedUrl = current ? youtubeEmbedUrl(current.video_url) : null;

                            if (embedUrl) {
                                return (
                                    <div className="mt-3 aspect-video overflow-hidden rounded-lg">
                                        <iframe
                                            key={current.id}
                                            src={embedUrl}
                                            title={current.label}
                                            className="h-full w-full"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    </div>
                                );
                            }

                            // Bukan link YouTube (kemungkinan besar video_source: upload) — pakai <video> native
                            return (
                                <video
                                    key={current.id}
                                    src={current.video_url}
                                    controls
                                    className="mt-3 aspect-video w-full rounded-lg bg-black"
                                />
                            );
                        })()
                    ) : (
                        <p className="mt-3 text-sm text-vw-grey">No video available yet.</p>
                    )}

                    {order.personal_message && (
                        <p className="mt-4 rounded-lg bg-vw-grey-light px-4 py-3 text-sm italic text-gray-700">
                            "{order.personal_message}"
                        </p>
                    )}
                </section>

                <hr className="my-8 border-vw-grey-light" />

                {/* 3. Service Inspection Result */}
                <section className="px-6">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">
                            Inspection Items
                        </h2>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
                                ${isPricingFinal ? 'bg-approved/10 text-approved' : 'bg-amber-100 text-amber-700'}`}
                        >
                            {isPricingFinal ? 'Final Price' : 'Estimated Price'}
                        </span>
                    </div>

                    {isLocked && !hasPendingItems && (
                        <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2 text-sm font-medium text-gray-700">
                            All items have been decided for this report.
                        </p>
                    )}

                    {isLocked && hasPendingItems && !canDecide && (
                        <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2 text-sm font-medium text-gray-700">
                            This report is no longer accepting new decisions.
                        </p>
                    )}

                    <div className="mt-4 divide-y divide-vw-grey-light border-y border-vw-grey-light">
                        {items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-gray-900">{item.name}</span>
                                        {item.group && (
                                            <span className="rounded bg-vw-grey-light px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-vw-grey">
                                                {GROUP_LABEL[item.group] ?? item.group}
                                            </span>
                                        )}
                                        <StatusStamp status={item.status} />
                                    </div>
                                    {item.description && (
                                        <p className="mt-0.5 text-sm text-vw-grey">{item.description}</p>
                                    )}
                                </div>

                                <div className="shrink-0 text-right">
                                    <p className="font-mono text-sm font-semibold text-gray-900">
                                        Rp {itemDisplayPrice(item).toLocaleString('id-ID')}
                                    </p>
                                    {canDecide && item.status === 'pending' && (
                                        <div className="mt-1 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDecision(item.id, 'approved')}
                                                className="rounded-full border border-approved px-2.5 py-0.5 text-xs font-semibold text-approved hover:bg-approved hover:text-white"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDecision(item.id, 'rejected')}
                                                className="rounded-full border border-vw-grey px-2.5 py-0.5 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-sm text-vw-grey">
                            <span>Subtotal</span>
                            <span className="font-mono text-gray-700">
                                Rp {subtotal.toLocaleString('id-ID')}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-vw-grey">
                            <span>VAT ({vatPercent}%)</span>
                            <span className="font-mono text-gray-700">
                                Rp {vatAmount.toLocaleString('id-ID')}
                            </span>
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

                    {/* FIX #2: tombol submit sekarang berdasarkan hasDecisionToSubmit
                        (ada keputusan yang belum dikirim), bukan hasPendingItems —
                        sebelumnya tombol langsung hilang begitu semua item di-decide
                        di state lokal, padahal belum tersimpan ke backend. */}
                    {canDecide && hasDecisionToSubmit && (
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="mt-6 w-full rounded-lg bg-vw-blue py-3 text-sm font-semibold text-white transition-opacity"
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

                {/* Invoice viewer — muncul mulai status quality_control/
                    invoice_preparation/completed. Sekarang render daftar dari
                    order.invoices (bisa lebih dari 1 file), bukan 1 link tunggal.
                    Kalau order sudah di tahap ini tapi SA belum sempat upload,
                    tampilkan pesan "belum tersedia" alih-alih menyembunyikan
                    section total. */}
                {/* Estimation Form — muncul HANYA saat work_in_progress, list PDF per group */}
                {showEstimationSection && (
                    <>
                        <hr className="my-8 border-vw-grey-light" />
                        <section className="px-6">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">
                                Estimation Form
                            </h2>

                            {order.estimationDocuments?.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                    {order.estimationDocuments.map((doc) => (
                                        <a
                                            key={doc.id}
                                            href={`/storage/${doc.pdf_path}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 rounded-lg border border-vw-grey/20 px-4 py-3 text-sm text-gray-700 hover:border-vw-blue hover:text-vw-blue"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
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
                                <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2 text-sm text-vw-grey">
                                    Estimation form is being prepared and will appear here shortly.
                                </p>
                            )}
                        </section>
                    </>
                )}

                {/* Invoice Form — muncul mulai quality_control/invoice_preparation/completed */}
                {showInvoiceSection && (
                    <>
                        <hr className="my-8 border-vw-grey-light" />
                        <section className="px-6">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">
                                Invoice Form
                            </h2>

                            {invoices.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                    {invoices.map((invoice, index) => (
                                        <a
                                            key={invoice.id}
                                            href={`/storage/${invoice.file_path}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 rounded-lg border border-vw-grey/20 px-4 py-3 text-sm text-gray-700 hover:border-vw-blue hover:text-vw-blue"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
                                                <FileText className="h-4 w-4" />
                                            </span>
                                            <span>
                                                <span className="block font-medium text-gray-900">
                                                    View {invoice.label ?? `Invoice ${index + 1}`} (PDF)
                                                </span>
                                                <span className="text-xs text-vw-grey">Opens in a new tab</span>
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2 text-sm text-vw-grey">
                                    Invoice is being prepared and will appear here shortly.
                                </p>
                            )}
                        </section>
                    </>
                )}

                {/* Thank You — muncul HANYA saat status completed (Revisi Besar #2, poin 9) */}
                {showThankYouSection && (
                    <>
                        <hr className="my-8 border-vw-grey-light" />
                        <section className="px-6">
                            <div className="rounded-xl border border-approved/20 bg-approved/5 px-5 py-5 text-center">
                                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-approved/10">
                                    <CheckCircle2 className="h-5 w-5 text-approved" />
                                </span>
                                <h2 className="mt-3 text-base font-bold text-gray-900">Thank You!</h2>
                                <p className="mt-1 text-sm text-gray-700">
                                    Thank you for trusting {settings.workshop_name ?? 'VW PIK'} with your
                                    vehicle service. We hope to see you again soon.
                                </p>
                            </div>

                            <div className="mt-4 space-y-2">
                                {settings.era_phone && (
                                    <div className="flex items-center gap-3 rounded-lg border border-vw-grey/20 px-4 py-3 text-sm text-gray-700">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
                                            <Phone className="h-4 w-4" />
                                        </span>
                                        <span>
                                            <span className="block font-medium text-gray-900">
                                                Emergency Road Assist (ERA)
                                            </span>
                                            <span className="font-mono text-xs text-vw-grey">
                                                {settings.era_phone}
                                            </span>
                                        </span>
                                    </div>
                                )}

                                {bookingWaHref && (
                                    <a
                                        href={bookingWaHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 rounded-lg border border-vw-grey/20 px-4 py-3 text-sm text-gray-700 hover:border-vw-blue hover:text-vw-blue"
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
                                            <MessageCircle className="h-4 w-4" />
                                        </span>
                                        <span>
                                            <span className="block font-medium text-gray-900">
                                                Book your next service
                                            </span>
                                            <span className="text-xs text-vw-grey">Chat with us on WhatsApp</span>
                                        </span>
                                    </a>
                                )}

                                {settings.survey_form_url && (
                                    <a
                                        href={settings.survey_form_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 rounded-lg bg-vw-blue px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                                    >
                                        Share Your Feedback
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </div>
                        </section>
                    </>
                )}

                <hr className="my-8 border-vw-grey-light" />

                {/* CTA Hubungi SA — hanya muncul saat order sedang menunggu tindak lanjut customer */}
                {order.status === 'invoice_preparation' && waHref && (
                    <section className="px-6">
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-vw-blue/20 bg-vw-blue/5 px-5 py-4">
                            <div>
                                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                    Ready for Pickup
                                </span>
                                <p className="mt-1.5 text-sm font-semibold text-gray-900">Waiting on your response</p>
                                <p className="mt-0.5 text-xs text-vw-grey">
                                    Have questions? Reach out to your service advisor.
                                </p>
                            </div>
                            <a
                                href={waHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex shrink-0 items-center gap-1.5 rounded-full bg-vw-blue px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                            >
                                <MessageCircle className="h-3.5 w-3.5" />
                                Contact SA
                            </a>
                        </div>
                    </section>
                )}

                <hr className="my-8 border-vw-grey-light" />

                {/* 4 & 5. Contact + Location */}
                <section className="grid grid-cols-1 gap-6 px-6 sm:grid-cols-2">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Contact</h2>
                        <p className="mt-2 font-medium text-gray-900">{serviceAdvisor.name}</p>
                        <p className="text-sm text-vw-grey">Service Advisor</p>

                        <div className="mt-3 space-y-2">
                            {serviceAdvisor.phone && (
                                <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2.5 rounded-lg border border-vw-grey/20 px-3 py-2 text-sm text-gray-700 hover:border-vw-blue hover:text-vw-blue"
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
                                        <Phone className="h-4 w-4" />
                                    </span>
                                    <span className="font-mono">{serviceAdvisor.phone}</span>
                                </a>
                            )}
                            <a
                                href={`mailto:${serviceAdvisor.email}`}
                                className="flex items-center gap-2.5 rounded-lg border border-vw-grey/20 px-3 py-2 text-sm text-gray-700 hover:border-vw-blue hover:text-vw-blue"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vw-grey-light">
                                    <Mail className="h-4 w-4" />
                                </span>
                                <span className="truncate font-mono">{serviceAdvisor.email}</span>
                            </a>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Location</h2>
                        <p className="mt-2 text-sm text-gray-700">{settings.address ?? '[Address]'}</p>

                        {settings.google_maps_embed_url && (
                            <iframe
                                src={settings.google_maps_embed_url}
                                width="100%"
                                height="200"
                                style={{ border: 0 }}
                                allowFullScreen=""
                                loading="lazy"
                                referrerPolicy="strict-origin-when-cross-origin"
                                className="mt-3 rounded-lg"
                            />
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                            {settings.google_maps_url && (
                                <a
                                    href={settings.google_maps_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-vw-grey px-4 py-1.5 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                >
                                    Open in Maps
                                </a>
                            )}
                            {settings.website_url && (
                                <a
                                    href={settings.website_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-vw-grey px-4 py-1.5 text-xs font-semibold text-vw-grey hover:bg-vw-grey hover:text-white"
                                >
                                    Visit Website
                                </a>
                            )}
                            {bookingWaHref && (
                                <a
                                    href={bookingWaHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-vw-blue px-4 py-1.5 text-xs font-semibold text-vw-blue hover:bg-vw-blue hover:text-white"
                                >
                                    Book a service
                                </a>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* Modal konfirmasi final */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-base font-bold text-gray-900">Confirm your decision</h3>
                        <p className="mt-1 text-sm text-vw-grey">
                            This action is final and cannot be changed afterwards for the items below.
                        </p>

                        <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                            {decidedThisRound.map((item) => (
                                <li key={item.id} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700">{item.name}</span>
                                    <StatusStamp status={item.status} />
                                </li>
                            ))}
                        </ul>

                        {/* FIX #3: total di modal hanya menjumlahkan item yang BARU
                            di-approve di sesi ini, bukan totalCost seluruh order.
                            Sekarang sudah termasuk VAT, sama seperti Grand Total
                            di section 3. */}
                        <div className="mt-4 space-y-1 border-t border-vw-grey-light pt-3">
                            <div className="flex items-center justify-between text-xs text-vw-grey">
                                <span>Subtotal</span>
                                <span className="font-mono">
                                    Rp {decidedApprovedSubtotal.toLocaleString('id-ID')}
                                </span>
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

                        <div className="mt-5 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                disabled={submitting}
                                className="flex-1 rounded-lg border border-vw-grey py-2 text-sm font-semibold text-vw-grey"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSubmit}
                                disabled={submitting}
                                className="flex-1 rounded-lg bg-vw-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {submitting ? 'Submitting...' : 'Confirm & Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </PublicLayout>
    );
}