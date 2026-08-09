import { Link, usePage } from '@inertiajs/react';
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

function NavGroup({ items }) {
    return (
        <SidebarMenu>
            {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                        asChild
                        isActive={route().current(item.routeName)}
                        tooltip={item.label}
                        className="relative data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1 data-[active=true]:before:bottom-1 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-vw-light-blue data-[active=true]:before:content-['']"
                    >
                        <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
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
                        <img
                            src="/images/vw-logo-white.jpeg"
                            alt="Volkswagen"
                            className="h-14 w-auto group-data-[collapsible=icon]:h-7"
                        />
                        <span className="text-center text-[12px] font-semibold leading-tight tracking-wide text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                            VW PIK
                            <br />
                            SERVICE
                        </span>
                    </Link>
                </SidebarHeader>

                <SidebarSeparator />

                <SidebarContent>
                    <SidebarGroup>
                        <NavGroup items={MAIN_NAV_ITEMS} />
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel>Master Data</SidebarGroupLabel>
                        <NavGroup items={masterDataItems} />
                    </SidebarGroup>

                    {isAdmin && (
                        <SidebarGroup>
                            <NavGroup items={SETTINGS_ADMIN_ONLY_ITEMS} />
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