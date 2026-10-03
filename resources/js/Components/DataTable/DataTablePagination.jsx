import { Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/Components/ui/button';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationEllipsis,
} from '@/Components/ui/pagination';
import { cn } from '@/lib/utils';

// meta (opsional): { from, to, total } dari paginator Laravel — menampilkan "Showing 1–20 of 143".
export function DataTablePagination({ links, meta }) {
    const summary = meta ? (
        <p className="text-sm text-vw-grey">
            Showing {meta.from ?? 0}–{meta.to ?? 0} of {meta.total}
        </p>
    ) : null;

    if (!links || links.length <= 3) return summary ? <div className="mt-4">{summary}</div> : null;

    const prev = links[0];
    const next = links[links.length - 1];
    const pages = links.slice(1, -1);

    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {summary}
        <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationArrow link={prev} icon={ChevronLeft} label="Previous" />
                </PaginationItem>

                {pages.map((link, i) =>
                    link.label === '...' ? (
                        <PaginationItem key={i}>
                            <PaginationEllipsis />
                        </PaginationItem>
                    ) : (
                        <PaginationItem key={i}>
                            <PaginationNumber link={link} />
                        </PaginationItem>
                    )
                )}

                <PaginationItem>
                    <PaginationArrow link={next} icon={ChevronRight} label="Next" />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
        </div>
    );
}

function PaginationNumber({ link }) {
    const className = cn(
        buttonVariants({ variant: link.active ? 'outline' : 'ghost', size: 'icon' }),
        link.active && 'border-vw-blue bg-vw-blue text-white hover:bg-vw-blue hover:text-white'
    );

    if (!link.url) {
        return (
            <span aria-disabled="true" className={cn(className, 'pointer-events-none opacity-40')}>
                {link.label}
            </span>
        );
    }

    return (
        <Link
            href={link.url}
            preserveState
            aria-label={`Page ${link.label}`}
            aria-current={link.active ? 'page' : undefined}
            className={className}
        >
            {link.label}
        </Link>
    );
}

function PaginationArrow({ link, icon: Icon, label }) {
    const className = cn(buttonVariants({ variant: 'ghost', size: 'default' }), 'gap-1 px-2.5');
    const isPrev = label === 'Previous';

    const content = (
        <>
            {isPrev && <Icon className="h-4 w-4" />}
            <span className="hidden sm:inline">{label}</span>
            {!isPrev && <Icon className="h-4 w-4" />}
        </>
    );

    if (!link.url) {
        return (
            <span aria-disabled="true" aria-label={`${label} page`} className={cn(className, 'pointer-events-none opacity-40')}>
                {content}
            </span>
        );
    }

    return (
        <Link href={link.url} preserveState aria-label={`${label} page`} className={className}>
            {content}
        </Link>
    );
}