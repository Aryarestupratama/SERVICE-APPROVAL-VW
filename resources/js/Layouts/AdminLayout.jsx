import { Link, usePage } from '@inertiajs/react';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    ClipboardList,
    Users,
    Car,
    UserCog,
    Settings,
    LogOut,
    TrendingUp,
    Wrench,
    Upload, 
    Link2,
} from 'lucide-react';
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarFooter,
    SidebarSeparator,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarTrigger,
    SidebarInset,
} from '@/Components/ui/sidebar';

const MAIN_NAV_ITEMS = [
    { label: 'Dashboard', href: route('admin.dashboard'), routeName: 'admin.dashboard', icon: LayoutDashboard },
    { label: 'SA Performance', href: route('admin.dashboards.sa-performance'), routeName: 'admin.dashboards.sa-performance', icon: TrendingUp },
    { label: 'Part Performance', href: route('admin.dashboards.part-performance'), routeName: 'admin.dashboards.part-performance', icon: Wrench },
    { label: 'Service Orders', href: route('admin.service-orders.index'), routeName: 'admin.service-orders.*', icon: ClipboardList },
];

const MASTER_DATA_ITEMS = [
    { label: 'Customers', href: route('admin.customers.index'), routeName: 'admin.customers.*', icon: Users },
    { label: 'Vehicles', href: route('admin.vehicles.index'), routeName: 'admin.vehicles.*', icon: Car },
    { label: 'Vehicle Customer', href: route('admin.vehicle-customers.index'), routeName: 'admin.vehicle-customers.*', icon: Link2 },
    { label: 'Import Data', href: route('admin.vehicle-customer-import.create'), routeName: 'admin.vehicle-customer-import.*', icon: Upload },
];

const MASTER_DATA_ADMIN_ONLY_ITEMS = [
    { label: 'Staff', href: route('admin.users.index'), routeName: 'admin.users.*', icon: UserCog },
];

const SETTINGS_ADMIN_ONLY_ITEMS = [
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

function NavGroup({ items, layoutId }) {
    return (
        <SidebarMenu>
            {items.map((item) => {
                const isActive = route().current(item.routeName);

                return (
                    <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.label}
                            className="relative"
                        >
                            <Link href={item.href}>
                                {isActive && (
                                    <motion.div
                                        layoutId={layoutId}
                                        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-vw-light-blue"
                                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                    />
                                )}
                                <item.icon />
                                <span>{item.label}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );
}

export default function AdminLayout({ children, title, headerActions }) {
    const { auth } = usePage().props;
    const isAdmin = auth.user.role === 'admin';

    const masterDataItems = isAdmin
        ? [...MASTER_DATA_ITEMS, ...MASTER_DATA_ADMIN_ONLY_ITEMS]
        : MASTER_DATA_ITEMS;

    return (
        <SidebarProvider>
            <Sidebar collapsible="icon">
                <SidebarHeader>
                    <Link
                        href={route('admin.dashboard')}
                        className="flex flex-col items-center gap-2 px-2 py-4 group-data-[collapsible=icon]:py-2"
                    >
                        <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                            <div className="flex flex-1 shrink-0 justify-end group-data-[collapsible=icon]:flex-none">
                                <img
                                    src="/images/vw-logo-white.png"
                                    alt="Volkswagen"
                                    className="h-16 w-auto max-w-none shrink-0 group-data-[collapsible=icon]:h-8"
                                />
                            </div>
                            <div className="h-8 w-px shrink-0 bg-white/20 group-data-[collapsible=icon]:hidden" />
                            <div className="flex flex-1 shrink-0 justify-start group-data-[collapsible=icon]:hidden">
                                <img
                                    src="/images/audi.png"
                                    alt="Audi"
                                    className="h-20 w-auto max-w-none shrink-0"
                                />
                            </div>
                        </div>
                        <span className="text-center text-[12px] font-semibold leading-tight tracking-wide text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                            VW PIK
                            <br />
                            New Service Process
                        </span>
                    </Link>
                </SidebarHeader>

                <SidebarSeparator />

                <SidebarContent>
                    <SidebarGroup>
                        <NavGroup items={MAIN_NAV_ITEMS} layoutId="active-nav-indicator" />
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel>Master Data</SidebarGroupLabel>
                        <NavGroup items={masterDataItems} layoutId="active-nav-indicator" />
                    </SidebarGroup>

                    {isAdmin && (
                        <SidebarGroup>
                            <NavGroup items={SETTINGS_ADMIN_ONLY_ITEMS} layoutId="active-nav-indicator" />
                        </SidebarGroup>
                    )}
                </SidebarContent>

                <SidebarSeparator />

                <SidebarFooter>
                    <div className="flex items-center gap-2.5 px-1 py-1">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-foreground ring-1 ring-white/10">
                            {initials(auth.user.name)}
                        </div>
                        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                            <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                                {auth.user.name}
                            </p>
                            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/60">
                                {ROLE_LABEL[auth.user.role] ?? auth.user.role}
                            </p>
                        </div>
                        <Link
                            href={route('logout')}
                            method="post"
                            as="button"
                            type="button"
                            title="Log out"
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                        >
                            <LogOut className="h-4 w-4" />
                        </Link>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset>
                <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-vw-grey/15 bg-white px-3 sm:h-14 sm:gap-3 sm:px-6">
                    <SidebarTrigger className="shrink-0" />
                    {title && (
                        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-foreground sm:flex-initial">
                            {title}
                        </h1>
                    )}
                    {headerActions && (
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                            {headerActions}
                        </div>
                    )}
                </header>

                <div className="p-4 sm:p-6">{children}</div>
            </SidebarInset>
        </SidebarProvider>
    );
}