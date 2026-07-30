import { useState } from 'react';
import { Link, usePage } from '@inertiajs/react';

const NAV_ITEMS = [
    { label: 'Dashboard', href: route('admin.dashboard'), routeName: 'admin.dashboard' },
    { label: 'Service Orders', href: route('admin.service-orders.index'), routeName: 'admin.service-orders.*' },
    { label: 'Customers', href: route('admin.customers.index'), routeName: 'admin.customers.*' },
    { label: 'Vehicles', href: route('admin.vehicles.index'), routeName: 'admin.vehicles.*' },
];

const ROLE_LABEL = {
    admin: 'Admin',
    service_advisor: 'Service Advisor',
};

const ROLE_COLOR = {
    admin: 'bg-vw-light-blue',
    service_advisor: 'bg-approved',
};

export default function AdminLayout({ children, title }) {
    const { auth, flash } = usePage().props;
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-vw-grey-light">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-64 bg-vw-blue transition-transform duration-200
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
            >
                <div className="flex h-full flex-col">
                    {/* Brand */}
                    <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-vw-blue">
                            VW
                        </div>
                        <span className="font-semibold tracking-tight text-white">
                            Service Inspection
                        </span>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 space-y-1 px-3 py-6">
                        {NAV_ITEMS.map((item) => {
                            const isActive = route().current(item.routeName);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`block rounded-md border-l-4 px-4 py-2.5 text-sm font-medium transition-colors
                                        ${isActive
                                            ? 'border-vw-light-blue bg-white/10 text-white'
                                            : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User info + role badge */}
                    <div className="border-t border-white/10 px-4 py-4">
                        <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2.5">
                            <span
                                className={`h-2 w-2 flex-shrink-0 rounded-full ${ROLE_COLOR[auth.user.role] ?? 'bg-vw-grey'}`}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">
                                    {auth.user.name}
                                </p>
                                <p className="truncate text-xs text-white/60">
                                    {ROLE_LABEL[auth.user.role] ?? auth.user.role}
                                </p>
                            </div>
                        </div>
                        <Link
                            href={route('logout')}
                            method="post"
                            as="button"
                            type="button"
                            className="mt-3 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            Log out
                        </Link>
                    </div>
                </div>
            </aside>

            {/* Overlay saat sidebar mobile terbuka */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Konten utama */}
            <div className="lg:pl-64">
                {/* Top bar */}
                <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-vw-grey/20 bg-white px-4 sm:px-6">
                    <button
                        type="button"
                        className="text-gray-900 lg:hidden"
                        onClick={() => setSidebarOpen((prev) => !prev)}
                        aria-label="Open menu"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                        </svg>
                    </button>
                    {title && (
                        <h1 className="text-lg font-semibold tracking-tight text-gray-900">
                            {title}
                        </h1>
                    )}
                </header>

                {/* Flash message */}
                {flash?.success && (
                    <div className="mx-4 mt-4 rounded-md border-l-4 border-approved bg-approved/5 px-4 py-3 text-sm text-approved sm:mx-6">
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="mx-4 mt-4 rounded-md border-l-4 border-urgent bg-urgent/5 px-4 py-3 text-sm text-urgent sm:mx-6">
                        {flash.error}
                    </div>
                )}

                {/* Isi halaman */}
                <main className="p-4 sm:p-6">{children}</main>
            </div>
        </div>
    );
}