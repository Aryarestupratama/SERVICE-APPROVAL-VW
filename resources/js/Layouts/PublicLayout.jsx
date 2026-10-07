export default function PublicLayout({ children }) {
    return (
        <div className="flex min-h-dvh flex-col bg-white font-sans text-gray-900 antialiased selection:bg-vw-blue selection:text-white">
            <main className="mx-auto w-full max-w-6xl flex-1 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-2 [&_*:focus-visible]:ring-vw-blue [&_*:focus-visible]:ring-offset-2">
                {children}
            </main>

            <footer className="mx-auto w-full max-w-6xl border-t border-vw-grey-light px-6 py-6 text-center sm:px-10 lg:px-16 xl:px-24">
                <p className="text-[11px] uppercase tracking-widest text-vw-grey/70">
                    Digital inspection report by VW PIK
                </p>
            </footer>
        </div>
    );
}