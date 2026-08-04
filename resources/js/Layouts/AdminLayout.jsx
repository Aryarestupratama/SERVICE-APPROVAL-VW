import { Link, usePage } from '@inertiajs/react';
import {
    LayoutDashboard,
    ClipboardList,
    Users,
    Car,
    UserCog,
    Settings,
    LogOut,
} from 'lucide-react';
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarTrigger,
    SidebarInset,
} from '@/Components/ui/sidebar';

const BASE_NAV_ITEMS = [
    { label: 'Dashboard', href: route('admin.dashboard'), routeName: 'admin.dashboard', icon: LayoutDashboard },
    { label: 'Service Orders', href: route('admin.service-orders.index'), routeName: 'admin.service-orders.*', icon: ClipboardList },
    { label: 'Customers', href: route('admin.customers.index'), routeName: 'admin.customers.*', icon: Users },
    { label: 'Vehicles', href: route('admin.vehicles.index'), routeName: 'admin.vehicles.*', icon: Car },
];

const ADMIN_ONLY_NAV_ITEMS = [
    { label: 'Staff', href: route('admin.users.index'), routeName: 'admin.users.*', icon: UserCog },
    { label: 'Settings', href: route('admin.settings.edit'), routeName: 'admin.settings.*', icon: Settings },
];

const ROLE_LABEL = {
    admin: 'Admin',
    service_advisor: 'Service Advisor',
    chief_technician: 'Chief Technician',
};

function initials(name) {
    return name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export default function AdminLayout({ children, title }) {
    const { auth, flash } = usePage().props;

    const navItems = auth.user.role === 'admin'
        ? [...BASE_NAV_ITEMS, ...ADMIN_ONLY_NAV_ITEMS]
        : BASE_NAV_ITEMS;

    return (
        <SidebarProvider>
            <Sidebar collapsible="icon">
                <SidebarHeader>
                    <Link href={route('admin.dashboard')} className="flex items-center gap-2.5 px-2 py-1.5">
                        <img
                            src="/images/vw-logo-white.jpeg"
                            alt="Volkswagen"
                            className="h-5 w-auto flex-shrink-0"
                        />
                        <span className="truncate text-[13px] font-semibold tracking-wide text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                            SERVICE INSPECTION
                        </span>
                    </Link>
                </SidebarHeader>

                <SidebarContent>
                    <SidebarGroup>
                        <SidebarMenu>
                            {navItems.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={route().current(item.routeName)}
                                        tooltip={item.label}
                                    >
                                        <Link href={item.href}>
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter>
                    <div className="flex items-center gap-2.5 px-1 py-1">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-foreground">
                            {initials(auth.user.name)}
                        </div>
                        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                            <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                                {auth.user.name}
                            </p>
                            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/50">
                                {ROLE_LABEL[auth.user.role] ?? auth.user.role}
                            </p>
                        </div>
                        <Link
                            href={route('logout')}
                            method="post"
                            as="button"
                            type="button"
                            title="Log out"
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                        >
                            <LogOut className="h-4 w-4" />
                        </Link>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-vw-grey/15 bg-white px-4 sm:px-6">
                    <SidebarTrigger />
                    {title && (
                        <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
                            {title}
                        </h1>
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

                <div className="p-4 sm:p-6">{children}</div>
            </SidebarInset>
        </SidebarProvider>
    );
}