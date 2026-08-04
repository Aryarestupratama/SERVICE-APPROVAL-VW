import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/Components/ui/input';

// Search box dengan ikon kaca pembesar — dipakai di semua halaman admin,
// baik untuk search server-side (Customers, Users) maupun client-side
// global filter (dilempar ke DataTableToolbar).
export function DataTableSearchInput({
    value,
    onChange,
    placeholder = 'Search...',
    className = '',
    isLoading = false,
}) {
    const hasValue = Boolean(value);

    const clear = () => {
        onChange({ target: { value: '' } });
    };

    return (
        <div className={`relative max-w-xs ${className}`}>
            {isLoading ? (
                <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-vw-grey" />
            ) : (
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-vw-grey" />
            )}
            <Input
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                aria-label={placeholder}
                className={hasValue ? 'pl-8 pr-8' : 'pl-8'}
            />
            {hasValue && (
                <button
                    type="button"
                    onClick={clear}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vw-grey hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}