import { useState, useEffect } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { motion, MotionConfig } from 'framer-motion';
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
    ChevronDown,
    MessageSquareText,
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
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    SidebarTrigger,
    SidebarInset,
    useSidebar,
} from '@/Components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/Components/ui/collapsible';

// Chief technician tidak punya akses ke halaman-halaman ini (route-nya role:admin,service_advisor),
// jadi menunya juga tidak ditampilkan — bukan link yang berujung 403.
const MANAGER_ROLES = ['admin', 'service_advisor'];

const MAIN_NAV_ITEMS = [
    { label: 'Dashboard', href: route('admin.dashboard'), routeName: 'admin.dashboard', icon: LayoutDashboard },
    { label: 'SA Performance', href: route('admin.dashboards.sa-performance'), routeName: 'admin.dashboards.sa-performance', icon: TrendingUp, roles: MANAGER_ROLES },
    { label: 'Part Performance', href: route('admin.dashboards.part-performance'), routeName: 'admin.dashboards.part-performance', icon: Wrench, roles: MANAGER_ROLES },
    // Dropdown (FR-026): daftar yang sama dipakai dua kali lewat param `group`.
    {
        label: 'Service Orders',
        routeName: 'admin.service-orders.*',
        icon: ClipboardList,
        roles: MANAGER_ROLES,
        children: [
            { label: 'Work In Process', href: route('admin.service-orders.index', { group: 'in_process' }), group: 'in_process' },
            { label: 'Work Completed', href: route('admin.service-orders.index', { group: 'completed' }), group: 'completed' },
        ],
    },
    // FUAS (Follow Up After Service, FR-027): dua halaman daftar, aktif per nama route.
    {
        label: 'FUAS',
        routeName: 'admin.fuas.*',
        icon: MessageSquareText,
        roles: MANAGER_ROLES,
        badgeKey: 'fuas',
        children: [
            { label: 'FUAS In Process', href: route('admin.fuas.in-process'), routeName: 'admin.fuas.in-process', badgeKey: 'fuas' },
            { label: 'FUAS Completed', href: route('admin.fuas.completed'), routeName: 'admin.fuas.completed' },
        ],
    },
];

const MASTER_DATA_ITEMS = [
    { label: 'Customers', href: route('admin.customers.index'), routeName: 'admin.customers.*', icon: Users, roles: MANAGER_ROLES },
    { label: 'Vehicles', href: route('admin.vehicles.index'), routeName: 'admin.vehicles.*', icon: Car, roles: MANAGER_ROLES },
    { label: 'Vehicle Customer', href: route('admin.vehicle-customers.index'), routeName: 'admin.vehicle-customers.*', icon: Link2, roles: MANAGER_ROLES },
    { label: 'Import Data', href: route('admin.vehicle-customer-import.create'), routeName: 'admin.vehicle-customer-import.*', icon: Upload, roles: MANAGER_ROLES },
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

// Badge reminder FUAS (FR-030): jumlah order To Send + Reminder Due. Nilai awal dari shared prop
// (selalu segar tiap navigasi), lalu dipoll ringan tiap 5 detik (OQ-A5: realtime). Polling berhenti
// saat tab tidak aktif (RULE-044). Gagal poll sengaja senyap: badge hanya penanda pendamping,
// poll berikutnya mencoba lagi.
const FUAS_POLL_INTERVAL_MS = 5000;

function useFuasActionCount(enabled) {
    const serverCount = usePage().props.fuas?.action_count ?? 0;
    const [count, setCount] = useState(serverCount);

    useEffect(() => {
        setCount(serverCount);
    }, [serverCount]);

    useEffect(() => {
        if (!enabled) return undefined;

        let intervalId;

        const check = async () => {
            try {
                const res = await fetch(route('admin.fuas.action-count'), {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                if (!res.ok) return;
                const data = await res.json();
                if (typeof data.count === 'number') setCount(data.count);
            } catch {
                // Silent by design.
            }
        };

        const start = (immediate) => {
            clearInterval(intervalId);
            if (immediate) check();
            intervalId = setInterval(check, FUAS_POLL_INTERVAL_MS);
        };
        const stop = () => clearInterval(intervalId);

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                stop();
            } else {
                start(true); // kembali ke tab: segarkan dulu
            }
        };

        // Saat halaman baru dimuat, nilai dari server sudah segar: tidak perlu cek langsung.
        if (document.visibilityState !== 'hidden') start(false);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled]);

    return count;
}

// Lencana jumlah. Teks amber-700 di atas latar amber-50 (kontras, RULE-060); angka tetap terbaca
// pembaca layar lewat teks sr-only.
function CountBadge({ count, className = '' }) {
    if (!count) return null;

    return (
        <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-50 px-1.5 text-[11px] font-semibold tabular-nums text-amber-700 ${className}`}
        >
            {count > 99 ? '99+' : count}
            <span className="sr-only"> orders need action</span>
        </span>
    );
}

// Menu dengan sub-menu. Dibuka otomatis saat halaman aktif berada di dalamnya; tombol induk
// memakai aria-expanded (CollapsibleTrigger) sehingga dapat dioperasikan keyboard (RULE-062).
function NavDropdown({ item, badges }) {
    const { group } = usePage().props;
    const { state, isMobile } = useSidebar();
    const parentBadge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
    const parentActive = route().current(item.routeName);
    const [open, setOpen] = useState(Boolean(parentActive));

    useEffect(() => {
        if (parentActive) setOpen(true);
    }, [parentActive]);

    // Sub-menu aktif hanya di halaman daftar; di halaman detail hanya induknya yang ditandai.
    const isChildActive = (child) =>
        child.routeName
            ? route().current(child.routeName)
            : route().current('admin.service-orders.index') && (group === 'completed' ? 'completed' : 'in_process') === child.group;

    // Saat sidebar diciutkan ke ikon, sub-menu tersembunyi: ikon langsung menuju sub-menu pertama.
    if (state === 'collapsed' && !isMobile) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={parentActive} tooltip={item.label} className="relative">
                    <Link href={item.children[0].href} aria-current={parentActive ? 'page' : undefined}>
                        <item.icon />
                        <span>{item.label}</span>
                        <CountBadge count={parentBadge} className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]" />
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
        );
    }

    return (
        <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={parentActive} tooltip={item.label}>
                        <item.icon />
                        <span>{item.label}</span>
                        {!open && <CountBadge count={parentBadge} className="ml-1" />}
                        <ChevronDown
                            className="ml-auto h-4 w-4 transition-transform motion-reduce:transition-none group-data-[state=open]/collapsible:rotate-180"
                            aria-hidden="true"
                        />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {item.children.map((child) => {
                            const active = isChildActive(child);

                            return (
                                <SidebarMenuSubItem key={child.href}>
                                    <SidebarMenuSubButton asChild isActive={active} className="h-9">
                                        <Link href={child.href} aria-current={active ? 'page' : undefined}>
                                            <span>{child.label}</span>
                                            {child.badgeKey && <CountBadge count={badges[child.badgeKey] ?? 0} className="ml-auto" />}
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            );
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
}

function NavGroup({ items, layoutId, badges = {} }) {
    return (
        <SidebarMenu>
            {items.map((item) => {
                if (item.children) {
                    return <NavDropdown key={item.label} item={item} badges={badges} />;
                }

                const isActive = route().current(item.routeName);

                return (
                    <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.label}
                            className="relative"
                        >
                            <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
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

    const role = auth.user.role;
    const visible = (items) => items.filter((item) => !item.roles || item.roles.includes(role));

    const mainItems = visible(MAIN_NAV_ITEMS);
    // Chief technician tidak punya menu FUAS: tidak perlu polling.
    const fuasCount = useFuasActionCount(MANAGER_ROLES.includes(role));
    const masterDataItems = visible(
        isAdmin ? [...MASTER_DATA_ITEMS, ...MASTER_DATA_ADMIN_ONLY_ITEMS] : MASTER_DATA_ITEMS
    );

    return (
        <MotionConfig reducedMotion="user">
        <SidebarProvider>
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
            >
                Skip to content
            </a>
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
                        <NavGroup items={mainItems} layoutId="active-nav-indicator" badges={{ fuas: fuasCount }} />
                    </SidebarGroup>

                    {masterDataItems.length > 0 && (
                        <SidebarGroup>
                        <SidebarGroupLabel>Master Data</SidebarGroupLabel>
                        <NavGroup items={masterDataItems} layoutId="active-nav-indicator" />
                    </SidebarGroup>
                    )}

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
                            aria-label="Log out"
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
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
                        <h1 className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground sm:flex-initial">
                            {title}
                        </h1>
                    )}
                    {headerActions && (
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                            {headerActions}
                        </div>
                    )}
                </header>

                <div id="main-content" tabIndex={-1} className="p-4 outline-none sm:p-6">{children}</div>
            </SidebarInset>
        </SidebarProvider>
        </MotionConfig>
    );
}