import PublicLayout from '@/Layouts/PublicLayout';
import { Head } from '@inertiajs/react';

export default function LinkExpired() {
    return (
        <PublicLayout>
            <Head title="Link Expired" />
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="max-w-sm text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-vw-grey">
                        Link Expired
                    </p>
                    <h1 className="mt-2 text-xl font-bold text-gray-900">
                        This link is no longer active
                    </h1>
                    <p className="mt-2 text-sm text-vw-grey">
                        Please contact the workshop to request a new inspection report link.
                    </p>
                </div>
            </div>
        </PublicLayout>
    );
}