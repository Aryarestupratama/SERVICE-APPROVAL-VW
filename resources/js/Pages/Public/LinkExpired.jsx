import PublicLayout from '@/Layouts/PublicLayout';
import { Head } from '@inertiajs/react';

export default function LinkExpired() {
    return (
        <PublicLayout>
            <Head title="Link Expired" />
            <section>
                <h1>This link has expired</h1>
                <p>
                    Please contact the workshop to request a new inspection report link.
                </p>
            </section>
        </PublicLayout>
    );
}