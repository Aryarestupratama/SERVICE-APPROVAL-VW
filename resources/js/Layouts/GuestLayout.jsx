import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-vw-grey-light px-4">
            <div className="mb-8 flex flex-col items-center">
                <Link href="/" className="flex h-14 w-14 items-center justify-center rounded-full bg-vw-blue text-lg font-bold text-white">
                    VW
                </Link>
                <p className="mt-3 text-sm font-medium text-vw-grey">
                    Service Inspection Report
                </p>
            </div>

            <div className="w-full overflow-hidden rounded-lg border border-vw-grey/20 bg-white px-6 py-8 shadow-sm sm:max-w-md sm:px-8">
                {children}
            </div>
        </div>
    );
}