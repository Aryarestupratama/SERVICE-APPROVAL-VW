import { Link, usePage, router } from '@inertiajs/react';
import { Bell } from 'lucide-react';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/Components/ui/popover';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';

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

function timeAgo(dateString) {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function NotificationBell() {
    const { notifications } = usePage().props;
    const unreadCount = notifications?.unread_count ?? 0;
    const items = notifications?.items ?? [];

    const handleItemClick = (notification) => {
        if (!notification.read_at) {
            router.post(route('notifications.read', notification.id), {}, {
                preserveScroll: true,
                preserveState: true,
            });
        }

        if (notification.service_order_id) {
            router.visit(route('admin.service-orders.show', notification.service_order_id));
        }
    };

    const handleMarkAllAsRead = () => {
        router.post(route('notifications.read-all'), {}, {
            preserveScroll: true,
            preserveState: true,
        });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-vw-grey/10 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">Notifications</p>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAllAsRead}
                            className="text-xs font-medium text-vw-blue hover:underline"
                        >
                            Mark all as read
                        </button>
                    )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-vw-grey">
                            No notifications yet.
                        </p>
                    ) : (
                        items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleItemClick(item)}
                                className={`block w-full border-b border-vw-grey/10 px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-vw-grey-light
                                    ${!item.read_at ? 'bg-vw-blue/5' : ''}`}
                            >
                                <p className="text-gray-900">{item.message}</p>
                                <p className="mt-1 text-xs text-vw-grey">{timeAgo(item.created_at)}</p>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

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
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-vw-grey/20 bg-white px-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <SidebarTrigger className="lg:hidden" />
                        {title && (
                            <h1 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h1>
                        )}
                    </div>
                    <NotificationBell />
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