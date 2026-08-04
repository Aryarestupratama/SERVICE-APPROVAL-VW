export default function GuestLayout({ children }) {
    return (
        <div className="flex min-h-screen">
            <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
                <div className="mx-auto w-full max-w-sm">
                    <img
                        src="/images/vw-logo-navy.jpeg"
                        alt="Volkswagen"
                        className="mb-12 h-16 w-auto"
                    />

                    {children}
                </div>
            </div>

            <div className="relative hidden w-1/2 bg-vw-blue lg:block">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: "url('/images/login-hero.jpg')" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-vw-blue via-vw-blue/60 to-vw-blue/20" />

                <div className="absolute inset-x-0 bottom-0 p-12">
                    <p className="text-2xl font-semibold text-white">
                        Service Inspection Report
                    </p>
                    <p className="mt-2 max-w-sm text-sm text-white/80">
                        Internal system for tracking vehicle inspections,
                        approvals, and customer communication — VW PIK.
                    </p>
                </div>
            </div>
        </div>
    );
}