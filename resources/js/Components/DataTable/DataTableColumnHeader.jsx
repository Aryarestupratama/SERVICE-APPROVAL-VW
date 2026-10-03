import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { flexRender } from '@tanstack/react-table';
import { TableHead } from '@/Components/ui/table';

export function DataTableColumnHeader({ header }) {
    const canSort = header.column.getCanSort();
    const sortDirection = header.column.getIsSorted();
    const alignEnd = header.column.columnDef.meta?.align === 'right';

    if (header.isPlaceholder) {
        return <TableHead />;
    }

    if (!canSort) {
        return (
            <TableHead className={alignEnd ? 'text-right' : undefined}>
                {flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>
        );
    }

    const ariaSort = sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none';

    return (
        <TableHead aria-sort={ariaSort}>
            <button
                type="button"
                onClick={header.column.getToggleSortingHandler()}
                className={`-mx-2 flex select-none items-center gap-1 rounded-md px-2 py-1 text-left transition-colors ${alignEnd ? 'ml-auto justify-end' : ''} hover:bg-vw-grey-light/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vw-blue`}
            >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {sortDirection === 'asc' && <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                {sortDirection === 'desc' && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
                {!sortDirection && <ChevronsUpDown className="h-3.5 w-3.5 text-vw-grey/50" aria-hidden="true" />}
            </button>
        </TableHead>
    );
}