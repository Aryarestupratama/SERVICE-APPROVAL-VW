import { Link, usePage } from '@inertiajs/react';
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarTrigger,
    SidebarInset,
} from '@/Components/ui/sidebar';

const BASE_NAV_ITEMS = [
    { label: 'Dashboard', href: route('admin.dashboard'), routeName: 'admin.dashboard' },
    { label: 'Service Orders', href: route('admin.service-orders.index'), routeName: 'admin.service-orders.*' },
    { label: 'Customers', href: route('admin.customers.index'), routeName: 'admin.customers.*' },
    { label: 'Vehicles', href: route('admin.vehicles.index'), routeName: 'admin.vehicles.*' },
];

const ADMIN_ONLY_NAV_ITEMS = [
    { label: 'Staff', href: route('admin.users.index'), routeName: 'admin.users.*' },
    { label: 'Settings', href: route('admin.settings.edit'), routeName: 'admin.settings.*' },
];

const ROLE_LABEL = {
    admin: 'Admin',
    service_advisor: 'Service Advisor',
    technician: 'Technician',
};

const ROLE_COLOR = {
    admin: 'bg-vw-light-blue',
    service_advisor: 'bg-approved',
    technician: 'bg-vw-grey',
};

export default function AdminLayout({ children, title }) {
    const { auth, flash } = usePage().props;

    const navItems = auth.user.role === 'admin'
        ? [...BASE_NAV_ITEMS, ...ADMIN_ONLY_NAV_ITEMS]
        : BASE_NAV_ITEMS;

    return (
        <SidebarProvider>
            <Sidebar>
                {/* ... */}
                <SidebarContent>
                    <SidebarMenu>
                        {navItems.map((item) => (
                            <SidebarMenuItem key={item.href}>
                                <SidebarMenuButton asChild isActive={route().current(item.routeName)}>
                                    <Link href={item.href}>{item.label}</Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>
                
                <SidebarFooter>
                    <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2.5">
                        <span
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${ROLE_COLOR[auth.user.role] ?? 'bg-vw-grey'}`}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{auth.user.name}</p>
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
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-vw-grey/20 bg-white px-4 sm:px-6">
                    <SidebarTrigger className="lg:hidden" />
                    {title && (
                        <h1 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h1>
                    )}
                </header>

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

                <main className="p-4 sm:p-6">{children}</main>
            </SidebarInset>
        </SidebarProvider>
    );
}