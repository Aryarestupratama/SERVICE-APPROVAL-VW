export default function GuestLayout({ children }) {
    return (
        <div className="flex min-h-screen flex-col lg:flex-row">
            <div className="flex w-full flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 lg:w-1/2 lg:px-20">
                <div className="mx-auto w-full max-w-sm">
                    <div className="mb-8 flex items-center gap-4 sm:mb-12">
                        <img
                            src="/images/vw-logo-navy.jpeg"
                            alt="Volkswagen"
                            className="h-12 w-auto sm:h-16"
                        />
                        <div className="h-10 w-px bg-border sm:h-12" />
                        <img
                            src="/images/audi.svg"
                            alt="Audi"
                            className="h-7 w-auto sm:h-9"
                        />
                    </div>

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
                        New VW PIK Service Process
                    </p>
                    <p className="mt-2 max-w-sm text-sm text-white/80">
                        Internal system for tracking vehicle inspections,
                        approvals, and customer communication.
                    </p>
                </div>
            </div>
        </div>
    );
}