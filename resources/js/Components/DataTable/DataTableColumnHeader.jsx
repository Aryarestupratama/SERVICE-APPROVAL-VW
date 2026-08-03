import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { flexRender } from '@tanstack/react-table';
import { TableHead } from '@/Components/ui/table';

export function DataTableColumnHeader({ header }) {
    const canSort = header.column.getCanSort();
    const sortDirection = header.column.getIsSorted();

    if (header.isPlaceholder) {
        return <TableHead />;
    }

    if (!canSort) {
        return (
            <TableHead>
                {flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>
        );
    }

    return (
        <TableHead
            className="cursor-pointer select-none"
            onClick={header.column.getToggleSortingHandler()}
        >
            <div className="flex items-center gap-1">
                {flexRender(header.column.columnDef.header, header.getContext())}
                {sortDirection === 'asc' && <ArrowUp className="h-3.5 w-3.5" />}
                {sortDirection === 'desc' && <ArrowDown className="h-3.5 w-3.5" />}
                {!sortDirection && <ChevronsUpDown className="h-3.5 w-3.5 text-vw-grey/50" />}
            </div>
        </TableHead>
    );
}