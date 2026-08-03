import { Link } from '@inertiajs/react';

export function DataTablePagination({ links }) {
    if (!links || links.length <= 3) return null;

    return (
        <div className="mt-4 flex flex-wrap gap-1">
            {links.map((link, i) => (
                <Link
                    key={i}
                    href={link.url ?? '#'}
                    preserveScroll
                    preserveState
                    className={`rounded-md px-3 py-1.5 text-sm ${
                        link.active
                            ? 'bg-vw-blue text-white'
                            : link.url
                            ? 'text-vw-grey hover:bg-vw-grey-light'
                            : 'cursor-not-allowed text-vw-grey/40'
                    }`}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                />
            ))}
        </div>
    );
}