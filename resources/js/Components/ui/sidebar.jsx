import { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const SidebarContext = createContext(null);

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
    return ctx;
}

export function SidebarProvider({ children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    const [openMobile, setOpenMobile] = useState(false);
    const isMobile = useIsMobile();

    const toggleSidebar = () =>
        isMobile ? setOpenMobile((v) => !v) : setOpen((v) => !v);

    return (
        <SidebarContext.Provider
            value={{ open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }}
        >
            <div className="flex min-h-screen w-full">{children}</div>
        </SidebarContext.Provider>
    );
}

export function Sidebar({ children, className }) {
    const { open, openMobile, setOpenMobile, isMobile } = useSidebar();

    if (isMobile) {
        return (
            <>
                {openMobile && (
                    <div
                        className="fixed inset-0 z-30 bg-black/30"
                        onClick={() => setOpenMobile(false)}
                    />
                )}
                <aside
                    className={cn(
                        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200',
                        openMobile ? 'translate-x-0' : '-translate-x-full',
                        className
                    )}
                >
                    {children}
                </aside>
            </>
        );
    }

    return (
        <aside
            className={cn(
                'sticky top-0 h-screen flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
                open ? 'flex w-64' : 'flex w-16',
                className
            )}
        >
            {children}
        </aside>
    );
}

export function SidebarHeader({ children, className }) {
    return (
        <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border px-4', className)}>
            {children}
        </div>
    );
}

export function SidebarContent({ children, className }) {
    return <div className={cn('flex-1 space-y-1 overflow-y-auto px-3 py-6', className)}>{children}</div>;
}

export function SidebarFooter({ children, className }) {
    return <div className={cn('border-t border-sidebar-border px-3 py-4', className)}>{children}</div>;
}

export function SidebarMenu({ children }) {
    return <nav className="space-y-1">{children}</nav>;
}

export function SidebarMenuItem({ children }) {
    return <div>{children}</div>;
}

export function SidebarMenuButton({ asChild, isActive, className, children, ...props }) {
    const Comp = asChild ? 'span' : 'button';
    return (
        <Comp
            className={cn(
                'flex items-center gap-3 rounded-md border-l-4 px-4 py-2.5 text-sm font-medium transition-colors w-full',
                isActive
                    ? 'border-sidebar-primary bg-white/10 text-white'
                    : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white',
                className
            )}
            {...props}
        >
            {children}
        </Comp>
    );
}

export function SidebarTrigger({ className }) {
    const { toggleSidebar } = useSidebar();
    return (
        <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className={cn('text-gray-900', className)}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
        </button>
    );
}

export function SidebarInset({ children, className }) {
    const { open, isMobile } = useSidebar();
    return (
        <div
            className={cn(
                'flex min-h-screen flex-1 flex-col transition-[margin] duration-200',
                !isMobile && !open && 'lg:ml-0',
                className
            )}
        >
            {children}
        </div>
    );
}