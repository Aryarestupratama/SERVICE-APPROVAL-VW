import { useMemo } from 'react';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/Components/ui/popover';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Filter panel generic untuk semua tabel admin — server-side (nempel ke query
 * params URL). Konsisten dengan pola `searchSlot` server-side yang sudah ada
 * (PROJECT-RULES.md bagian 10.2).
 *
 * Tipe filter yang didukung:
 * - 'select': dropdown dari daftar opsi tetap (untuk kolom enum, mis. brand).
 * - 'text': partial match single input (untuk kolom string bebas kalau memang
 *   perlu filter terpisah dari global search).
 * - 'number': numerik, dengan TOGGLE mode di UI antara "Exact" (1 nilai persis)
 *   dan "Range" (dari–sampai) — untuk kolom seperti year yang user kadang cari
 *   1 nilai persis, kadang rentang.
 *
 * Shape value per tipe:
 * - select: string
 * - text: string
 * - number: { mode: 'exact' | 'range', value: string, from: string, to: string }
 *
 * State filter aktif (`values`) & fetch ke backend WAJIB dikelola di level
 * halaman, sama seperti pola `searchTerm` — supaya bisa digabung jadi satu
 * router.get() dengan debounce yang sama dengan search.
 *
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   type: 'select' | 'text' | 'number',
 *   options?: string[],       // wajib untuk type: 'select'
 *   placeholder?: string,
 * }>} filters
 * @param {Object} values
 * @param {(key: string, value: any) => void} onChange
 * @param {() => void} onClear
 */
export function DataTableFilterPanel({ filters, values, onChange, onClear }) {
    const isFilterActive = (filter) => {
        const value = values[filter.key];
        if (filter.type === 'number') {
            return value?.mode === 'range'
                ? Boolean(value?.from || value?.to)
                : Boolean(value?.value);
        }
        return Boolean(value);
    };

    const activeCount = useMemo(
        () => filters.filter(isFilterActive).length,
        [filters, values]
    );

    const activeChips = useMemo(() => {
        return filters
            .map((filter) => {
                if (!isFilterActive(filter)) return null;
                const value = values[filter.key];

                if (filter.type === 'number') {
                    const text =
                        value.mode === 'range'
                            ? [value.from, value.to].filter(Boolean).join(' – ')
                            : value.value;
                    return { key: filter.key, label: `${filter.label}: ${text}` };
                }

                return { key: filter.key, label: `${filter.label}: ${value}` };
            })
            .filter(Boolean);
    }, [filters, values]);

    const clearOne = (filter) => {
        if (filter.type === 'number') {
            onChange(filter.key, { mode: 'exact', value: '', from: '', to: '' });
        } else {
            onChange(filter.key, '');
        }
    };

    const findFilterDef = (key) => filters.find((f) => f.key === key);

    const setNumberMode = (filter, mode) => {
        const current = values[filter.key] ?? {};
        onChange(filter.key, { mode, value: '', from: '', to: '' , ...pickModeFields(current, mode)});
    };

    // Saat pindah mode, buang nilai dari mode sebelumnya biar tidak nyangkut
    // (misal user isi range lalu pindah ke exact — from/to lama tidak relevan lagi).
    const pickModeFields = (current, mode) =>
        mode === 'range'
            ? { from: current.from ?? '', to: current.to ?? '' }
            : { value: current.value ?? '' };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        Filters
                        {activeCount > 0 && (
                            <Badge variant="secondary" className="ml-1 px-1.5">
                                {activeCount}
                            </Badge>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Filters</p>
                            {activeCount > 0 && (
                                <button
                                    type="button"
                                    onClick={onClear}
                                    className="text-xs font-medium text-muted-foreground hover:text-urgent"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {filters.map((filter) => (
                            <div key={filter.key} className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label>{filter.label}</Label>

                                    {filter.type === 'number' && (
                                        <div className="flex overflow-hidden rounded-md border text-xs">
                                            {['exact', 'range'].map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setNumberMode(filter, mode)}
                                                    className={cn(
                                                        'px-2 py-0.5 capitalize',
                                                        (values[filter.key]?.mode ?? 'exact') === mode
                                                            ? 'bg-vw-blue text-white'
                                                            : 'bg-transparent text-muted-foreground hover:bg-muted'
                                                    )}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {filter.type === 'select' && (
                                    <Select
                                        value={values[filter.key] || undefined}
                                        onValueChange={(value) => onChange(filter.key, value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue
                                                placeholder={filter.placeholder ?? `All ${filter.label}`}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filter.options.map((option) => (
                                                <SelectItem key={option} value={option}>
                                                    {option}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {filter.type === 'text' && (
                                    <Input
                                        value={values[filter.key] ?? ''}
                                        placeholder={filter.placeholder ?? `Search ${filter.label}`}
                                        onChange={(e) => onChange(filter.key, e.target.value)}
                                    />
                                )}

                                {filter.type === 'number' &&
                                    (values[filter.key]?.mode ?? 'exact') === 'exact' && (
                                        <Input
                                            type="number"
                                            placeholder={filter.placeholder ?? filter.label}
                                            value={values[filter.key]?.value ?? ''}
                                            onChange={(e) =>
                                                onChange(filter.key, {
                                                    ...values[filter.key],
                                                    mode: 'exact',
                                                    value: e.target.value,
                                                })
                                            }
                                        />
                                    )}

                                {filter.type === 'number' &&
                                    values[filter.key]?.mode === 'range' && (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                placeholder="From"
                                                value={values[filter.key]?.from ?? ''}
                                                onChange={(e) =>
                                                    onChange(filter.key, {
                                                        ...values[filter.key],
                                                        mode: 'range',
                                                        from: e.target.value,
                                                    })
                                                }
                                            />
                                            <span className="text-sm text-muted-foreground">–</span>
                                            <Input
                                                type="number"
                                                placeholder="To"
                                                value={values[filter.key]?.to ?? ''}
                                                onChange={(e) =>
                                                    onChange(filter.key, {
                                                        ...values[filter.key],
                                                        mode: 'range',
                                                        to: e.target.value,
                                                    })
                                                }
                                            />
                                        </div>
                                    )}
                            </div>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {activeChips.map((chip) => {
                const filter = findFilterDef(chip.key);
                return (
                    <Badge key={chip.key} variant="secondary" className="gap-1">
                        {chip.label}
                        <button
                            type="button"
                            onClick={() => clearOne(filter)}
                            className="ml-1 text-muted-foreground hover:text-urgent"
                            aria-label={`Remove ${filter.label} filter`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                );
            })}
        </div>
    );
}