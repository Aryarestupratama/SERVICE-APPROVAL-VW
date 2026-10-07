import PublicLayout from '@/Layouts/PublicLayout';
import { Head } from '@inertiajs/react';
import { Link2Off, MessageCircle } from 'lucide-react';

// wa.me butuh format internasional tanpa 0/+ di depan: 0812… → 62812…
const toWaDigits = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    return d.startsWith('0') ? `62${d.slice(1)}` : d;
};

// Props opsional: controller sebaiknya mengirim `settings` (workshop_name,
// booking_whatsapp_phone) dan `serviceAdvisor` (name, phone) kalau tokennya
// masih dikenali. Tanpa props, halaman tetap jalan dengan teks fallback.
export default function LinkExpired({ settings, serviceAdvisor }) {
    const workshopName = settings?.workshop_name ?? 'the workshop';
    const phone = serviceAdvisor?.phone ?? settings?.booking_whatsapp_phone ?? null;
    const waHref = phone
        ? `https://wa.me/${toWaDigits(phone)}?text=${encodeURIComponent(
              'Hello, my inspection report link has expired. Could you send me a new one?'
          )}`
        : null;

    return (
        <PublicLayout>
            <Head title="Link Expired" />
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="w-full max-w-sm text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-vw-blue/10 text-vw-blue ring-8 ring-vw-blue/5">
                        <Link2Off className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h1 className="mt-5 text-xl font-bold text-vw-blue">This link is no longer active</h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                        {waHref
                            ? `Message ${serviceAdvisor?.name ?? workshopName} on WhatsApp and we will send you a new report link.`
                            : 'Reply to the WhatsApp message you received from the workshop and we will send you a new report link.'}
                    </p>

                    {waHref && (
                        <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-vw-blue px-5 text-sm font-semibold text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90"
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            Request a new link
                        </a>
                    )}
                </div>
            </div>
        </PublicLayout>
    );
}