import { Search } from 'lucide-react';
import { Input } from '@/Components/ui/input';

// Search box dengan ikon kaca pembesar — dipakai di semua halaman admin,
// baik untuk search server-side (Customers, Users) maupun client-side
// global filter (dilempar ke DataTableToolbar).
export function DataTableSearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
    return (
        <div className={`relative max-w-xs ${className}`}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-vw-grey" />
            <Input
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="pl-8"
            />
        </div>
    );
}