import PublicLayout from '@/Layouts/PublicLayout';
import { Head } from '@inertiajs/react';
import { useState } from 'react';

// RAW/PLAIN VERSION — dummy data, belum konek ke backend.
// Tujuannya cuma untuk lihat alur section & interaksi approve/reject dulu.
// Styling & props asli menyusul setelah flow disetujui (lihat checkpoint Fase 2).

const DUMMY_VIDEOS = [
    { id: 1, label: 'Part 1' },
    { id: 2, label: 'Part 2' },
];

const DUMMY_ITEMS = [
    { id: 1, name: 'Ganti tension strut', cost: 850000, is_urgent: true, status: 'pending' },
    { id: 2, name: 'Ganti oli mesin', cost: 450000, is_urgent: false, status: 'pending' },
    { id: 3, name: 'Servis AC', cost: 300000, is_urgent: false, status: 'pending' },
];

export default function InspectionReport() {
    const [activeVideo, setActiveVideo] = useState(DUMMY_VIDEOS[0].id);
    const [items, setItems] = useState(DUMMY_ITEMS);

    const totalCost = items
        .filter((item) => item.status !== 'rejected')
        .reduce((sum, item) => sum + item.cost, 0);

    const handleDecision = (itemId, decision) => {
        setItems((prev) =>
            prev.map((item) =>
                item.id === itemId ? { ...item, status: decision } : item
            )
        );
    };

    return (
        <PublicLayout>
            <Head title="Inspection Report" />

            {/* 1. Hero / Branding */}
            <section>
                <h1>[Workshop Name]</h1>
                <p>Vehicle Inspection Report</p>
            </section>

            <hr />

            {/* 2. Video Personal */}
            <section>
                <h2>Inspection Video</h2>
                <p>Plate number: B 1234 XYZ</p>
                <p>Customer: John Doe</p>

                <div>
                    {DUMMY_VIDEOS.map((video) => (
                        <button
                            key={video.id}
                            type="button"
                            onClick={() => setActiveVideo(video.id)}
                        >
                            {video.label}
                        </button>
                    ))}
                </div>

                <div style={{ border: '1px solid black', padding: '20px' }}>
                    [Video player placeholder — currently showing:{' '}
                    {DUMMY_VIDEOS.find((v) => v.id === activeVideo)?.label}]
                </div>

                <p>Message from advisor: "Please check the items below, thank you."</p>
            </section>

            <hr />

            {/* 3. Service Inspection Result */}
            <section>
                <h2>Inspection Items</h2>

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
                                    {item.status === 'pending' ? (
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
            </section>

            <hr />

            {/* 4. Contact Details */}
            <section>
                <h2>Contact</h2>
                <p>Jane Smith — Service Advisor</p>
                <p>Phone: 0812xxxxxxx</p>
                <p>Email: jane@workshop.com</p>
            </section>

            <hr />

            {/* 5. Location + Booking */}
            <section>
                <h2>Location</h2>
                <p>[Google Maps embed placeholder]</p>
                <button type="button">Book a service</button>
            </section>
        </PublicLayout>
    );
}