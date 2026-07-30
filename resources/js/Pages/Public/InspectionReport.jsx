import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

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

            {/* 1. Hero / Branding */}
            <section>
                <h1>{settings.workshop_name ?? '[Workshop Name]'}</h1>
                <p>Vehicle Inspection Report</p>
            </section>

            <hr />

            {/* 2. Video Personal */}
            <section>
                <h2>Inspection Video</h2>
                <p>Plate number: {vehicle.plate_number}</p>
                <p>Customer: {customer.name}</p>

                <div>
                    {videos.map((video) => (
                        <button
                            key={video.id}
                            type="button"
                            onClick={() => setActiveVideo(video.id)}
                        >
                            {video.label}
                        </button>
                    ))}
                </div>

                {videos.length > 0 ? (
                    <div style={{ border: '1px solid black', padding: '20px' }}>
                        [Video player placeholder — currently showing:{' '}
                        {videos.find((v) => v.id === activeVideo)?.label}]
                    </div>
                ) : (
                    <p>No video available yet.</p>
                )}

                {order.personal_message && (
                    <p>Message from advisor: "{order.personal_message}"</p>
                )}
            </section>

            <hr />

            {/* 3. Service Inspection Result */}
            <section>
                <h2>Inspection Items</h2>

                {submitted && (
                    <p><strong>Your decisions have already been submitted for this report.</strong></p>
                )}

                <table border="1">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Cost</th>
                            <th>Urgent</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id}>
                                <td>{item.name}</td>
                                <td>Rp {item.cost.toLocaleString('id-ID')}</td>
                                <td>{item.is_urgent ? 'Yes' : '-'}</td>
                                <td>{item.status}</td>
                                <td>
                                    {!submitted && item.status === 'pending' ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleDecision(item.id, 'approved')}
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDecision(item.id, 'rejected')}
                                            >
                                                Reject
                                            </button>
                                        </>
                                    ) : (
                                        <em>Decided</em>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <p>
                    <strong>Total: Rp {totalCost.toLocaleString('id-ID')}</strong>
                </p>

                {!submitted && (
                    <button
                        type="button"
                        disabled={!allDecided}
                        onClick={() => setShowModal(true)}
                    >
                        Submit Decision
                    </button>
                )}

                {!submitted && !allDecided && (
                    <p><em>Please decide on all items before submitting.</em></p>
                )}
            </section>

            <hr />

            {/* 4. Contact Details */}
            <section>
                <h2>Contact</h2>
                <p>{serviceAdvisor.name} — Service Advisor</p>
                {serviceAdvisor.phone && <p>Phone: {serviceAdvisor.phone}</p>}
                <p>Email: {serviceAdvisor.email}</p>
            </section>

            <hr />

            {/* 5. Location + Booking */}
            <section>
                <h2>Location</h2>
                <p>{settings.address ?? '[Address]'}</p>
                <button type="button">Book a service</button>
            </section>

            {/* Modal konfirmasi final — plain, belum styling */}
            {showModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div style={{ background: 'white', padding: '24px', maxWidth: '400px' }}>
                        <h3>Confirm your decision</h3>
                        <p>
                            This action is final and cannot be changed afterwards.
                            Please review your decisions below:
                        </p>
                        <ul>
                            {items.map((item) => (
                                <li key={item.id}>
                                    {item.name} — <strong>{item.status}</strong>
                                </li>
                            ))}
                        </ul>
                        <p><strong>Total: Rp {totalCost.toLocaleString('id-ID')}</strong></p>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSubmit}
                                disabled={submitting}
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