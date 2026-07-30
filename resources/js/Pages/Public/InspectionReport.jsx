import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

function StatusStamp({ status }) {
    if (status === 'pending') return null;
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

export default function InspectionReport({ token, settings, order, vehicle, customer, serviceAdvisor, videos, items: initialItems }) {
    const [activeVideo, setActiveVideo] = useState(videos[0]?.id ?? null);
    const [items, setItems] = useState(initialItems);
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(order.status !== 'draft' && order.status !== 'sent' && order.status !== 'awaiting_approval');

    const totalCost = items
        .filter((item) => item.status !== 'rejected')
        .reduce((sum, item) => sum + item.cost, 0);

    const allDecided = items.every((item) => item.status !== 'pending');

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
                decisions: items.map((item) => ({
                    id: item.id,
                    status: item.status,
                })),
            },
            {
                onSuccess: () => {
                    setSubmitted(true);
                    setShowModal(false);
                },
                onError: () => {
                    setShowModal(false);
                },
                onFinish: () => setSubmitting(false),
            }
        );
    };

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
                        <div className="mt-3 flex aspect-video items-center justify-center rounded-lg border border-dashed border-vw-grey/40 bg-vw-grey-light text-sm text-vw-grey">
                            Video player — {videos.find((v) => v.id === activeVideo)?.label}
                        </div>
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
                    <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">
                        Inspection Items
                    </h2>

                    {submitted && (
                        <p className="mt-3 rounded-lg bg-vw-grey-light px-4 py-2 text-sm font-medium text-gray-700">
                            Your decisions have already been submitted for this report.
                        </p>
                    )}

                    <div className="mt-4 divide-y divide-vw-grey-light border-y border-vw-grey-light">
                        {items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-gray-900">{item.name}</span>
                                        {item.is_urgent && (
                                            <span className="rounded bg-urgent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-urgent">
                                                Urgent
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
                                        Rp {item.cost.toLocaleString('id-ID')}
                                    </p>
                                    {!submitted && item.status === 'pending' && (
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

                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm font-semibold uppercase tracking-wide text-vw-grey">Total</span>
                        <span className="font-mono text-lg font-bold text-vw-blue">
                            Rp {totalCost.toLocaleString('id-ID')}
                        </span>
                    </div>

                    {!submitted && (
                        <button
                            type="button"
                            disabled={!allDecided}
                            onClick={() => setShowModal(true)}
                            className="mt-6 w-full rounded-lg bg-vw-blue py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                        >
                            Submit Decision
                        </button>
                    )}

                    {!submitted && !allDecided && (
                        <p className="mt-2 text-center text-xs text-vw-grey">
                            Please decide on all items before submitting.
                        </p>
                    )}
                </section>

                <hr className="my-8 border-vw-grey-light" />

                {/* 4 & 5. Contact + Location */}
                <section className="grid grid-cols-1 gap-8 px-6 sm:grid-cols-2">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Contact</h2>
                        <p className="mt-2 font-medium text-gray-900">{serviceAdvisor.name}</p>
                        <p className="text-sm text-vw-grey">Service Advisor</p>
                        {serviceAdvisor.phone && (
                            <p className="mt-1 font-mono text-sm text-gray-700">{serviceAdvisor.phone}</p>
                        )}
                        <p className="font-mono text-sm text-gray-700">{serviceAdvisor.email}</p>
                    </div>

                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-vw-grey">Location</h2>
                        <p className="mt-2 text-sm text-gray-700">{settings.address ?? '[Address]'}</p>
                        <button
                            type="button"
                            className="mt-3 rounded-full border border-vw-blue px-4 py-1.5 text-xs font-semibold text-vw-blue hover:bg-vw-blue hover:text-white"
                        >
                            Book a service
                        </button>
                    </div>
                </section>
            </div>

            {/* Modal konfirmasi final */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-base font-bold text-gray-900">Confirm your decision</h3>
                        <p className="mt-1 text-sm text-vw-grey">
                            This action is final and cannot be changed afterwards.
                        </p>

                        <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                            {items.map((item) => (
                                <li key={item.id} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700">{item.name}</span>
                                    <StatusStamp status={item.status} />
                                </li>
                            ))}
                        </ul>

                        <div className="mt-4 flex items-center justify-between border-t border-vw-grey-light pt-3">
                            <span className="text-sm font-semibold text-vw-grey">Total</span>
                            <span className="font-mono text-base font-bold text-vw-blue">
                                Rp {totalCost.toLocaleString('id-ID')}
                            </span>
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