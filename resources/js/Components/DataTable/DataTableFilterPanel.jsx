import { useEffect, useMemo, useRef, useState } from 'react';
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
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/Components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/Components/ui/popover';
import { Calendar } from '@/Components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/Components/ui/toggle-group';
import { SlidersHorizontal, Pencil, X, CalendarIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tanggal selalu diformat/di-parse sebagai tanggal LOKAL. toISOString() memakai UTC,
// sehingga di UTC+7 memilih 2 Okt menghasilkan "2026-10-01".
const toLocalISODate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const normalizeOption = (o) => (typeof o === 'string' ? { value: o, label: o } : o);
const fromLocalISODate = (str) => {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
};

/**
 * Filter panel generic untuk semua tabel admin — server-side (nempel ke query
 * params URL). Konsisten dengan pola `searchSlot` server-side yang sudah ada
 * (PROJECT-RULES.md bagian 10.2).
 *
 * PERUBAHAN (2026-09-20): sebelumnya field filter langsung apply tiap kali
 * diubah (Popover, isi = auto-trigger fetch lewat debounce di halaman induk).
 * Sekarang dibungkus Dialog (modal) dengan staging lokal (`draft`) — field
 * yang diubah user TIDAK langsung memanggil `onChange` parent, cuma
 * memperbarui `draft` lokal. `onChange` parent baru dipanggil (sekali per key)
 * saat user klik "OK". Prop `onChange`/`onClear` SENGAJA dipertahankan
 * signature-nya sama seperti sebelumnya (bukan API baru) supaya halaman lain
 * yang sudah pakai komponen ini (Vehicles/Customers/Users — lihat
 * PROJECT-RULES.md bagian 1H) tidak perlu ikut diubah.
 *
 * PERUBAHAN (2026-09-20, revisi lanjutan): Filter & Columns digabung jadi
 * SATU tombol trigger ("Filter" / "Edit Filter" + badge jumlah filter aktif),
 * bukan 2 tombol terpisah lagi — supaya konsisten dipakai di semua halaman
 * admin index (Service Orders, Vehicles, Customers, Users) tanpa toolbar
 * perlu render dropdown Columns sendiri. Section "Columns" muncul di dalam
 * modal yang sama kalau prop `table` (instance react-table dari
 * `useDataTable`) dikirim — toggle visibility kolom di situ APPLY INSTAN
 * (bukan staged/nunggu OK) karena itu murni preferensi tampilan klien, beda
 * sifatnya dari filter server-side yang butuh konfirmasi eksplisit sebelum
 * memicu request baru.
 *
 * Tipe filter yang didukung: 'select' | 'text' | 'number' | 'date' — lihat
 * detail shape value per tipe di versi sebelumnya / dokumentasi tim.
 *
 * @param {object} [table] - instance react-table, opsional. Kalau diisi,
 *   modal menampilkan section "Columns" berisi checkbox show/hide tiap kolom
 *   yang `getCanHide()`-nya true.
 */
export function DataTableFilterPanel({ filters, values, onChange, onClear, table }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(values);

    // Setiap modal dibuka, draft direset dari filter yang SEDANG AKTIF
    // (values dari parent) — supaya user selalu mulai edit dari kondisi
    // terkini, bukan draft basi dari sesi buka-tutup sebelumnya yang batal
    // di-apply.
    // Reset draft HANYA saat modal dibuka. Kalau bergantung pada `values`, setiap re-render
    // induk (objek baru) akan menghapus ketikan user di tengah pengisian.
    const valuesRef = useRef(values);
    valuesRef.current = values;
    useEffect(() => {
        if (open) setDraft(valuesRef.current);
    }, [open]);

    const emptyValueFor = (filter) => {
        if (filter.type === 'number') return { mode: 'exact', value: '', from: '', to: '' };
        if (filter.type === 'date') return { mode: 'preset', preset: 'all', from: '', to: '' };
        return '';
    };

    const isFilterActive = (filter, source) => {
        const value = source[filter.key];
        if (filter.type === 'number') {
            return value?.mode === 'range'
                ? Boolean(value?.from || value?.to)
                : Boolean(value?.value);
        }
        if (filter.type === 'date') {
            return value?.mode === 'range'
                ? Boolean(value?.from || value?.to)
                : Boolean(value?.preset && value.preset !== 'all');
        }
        return Boolean(value);
    };

    // activeCount & chips SELALU dihitung dari `values` (filter yang benar-benar
    // ter-apply), bukan dari `draft` — supaya label tombol & chip di luar modal
    // tidak berubah cuma karena user lagi iseng ubah-ubah draft sebelum klik OK.
    const activeCount = useMemo(
        () => filters.filter((f) => isFilterActive(f, values)).length,
        [filters, values]
    );

    const activeChips = useMemo(() => {
        return filters
            .map((filter) => {
                if (!isFilterActive(filter, values)) return null;
                const value = values[filter.key];

                if (filter.type === 'number') {
                    const text =
                        value.mode === 'range'
                            ? [value.from, value.to].filter(Boolean).join(' – ')
                            : value.value;
                    return { key: filter.key, label: `${filter.label}: ${text}` };
                }

                if (filter.type === 'date') {
                    const text =
                        value.mode === 'range'
                            ? [value.from, value.to].filter(Boolean).join(' – ')
                            : (filter.presetOptions ?? []).find((p) => p.key === value.preset)?.label ?? value.preset;
                    return { key: filter.key, label: `${filter.label}: ${text}` };
                }

                const optionLabel = (filter.options ?? []).map(normalizeOption).find((o) => o.value === value)?.label ?? value;
                return { key: filter.key, label: `${filter.label}: ${optionLabel}` };
            })
            .filter(Boolean);
    }, [filters, values]);

    const findFilterDef = (key) => filters.find((f) => f.key === key);

    const handleDraftChange = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const pickModeFields = (current, mode) =>
        mode === 'range'
            ? { from: current.from ?? '', to: current.to ?? '' }
            : { value: current.value ?? '' };

    const setNumberMode = (filter, mode) => {
        const current = draft[filter.key] ?? {};
        handleDraftChange(filter.key, { mode, value: '', from: '', to: '', ...pickModeFields(current, mode) });
    };

    const setDateMode = (filter, mode) => {
        const current = draft[filter.key] ?? {};
        handleDraftChange(filter.key, {
            mode,
            preset: mode === 'preset' ? (current.preset || 'all') : 'all',
            from: mode === 'range' ? (current.from ?? '') : '',
            to: mode === 'range' ? (current.to ?? '') : '',
        });
    };

    // "Clear all filters" langsung diterapkan (aksi reset eksplisit) dan menutup modal —
    // sebelumnya hanya mengosongkan draft, sehingga menutup modal tanpa OK diam-diam
    // membiarkan filter lama tetap aktif.
    const handleClearDraft = () => {
        const cleared = Object.fromEntries(filters.map((f) => [f.key, emptyValueFor(f)]));
        setDraft(cleared);
        filters.forEach((f) => onChange(f.key, cleared[f.key]));
        setOpen(false);
    };

    const handleApply = () => {
        filters.forEach((filter) => onChange(filter.key, draft[filter.key]));
        setOpen(false);
    };

    const handleRemoveChip = (filter) => {
        onChange(filter.key, emptyValueFor(filter));
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        {activeCount > 0 ? (
                            <Pencil className="h-4 w-4" />
                        ) : (
                            <SlidersHorizontal className="h-4 w-4" />
                        )}
                        {table ? 'Filter & Columns' : activeCount > 0 ? 'Edit Filter' : 'Filter'}
                        {activeCount > 0 && (
                            <Badge variant="secondary" className="ml-1 px-1.5">
                                {activeCount}
                            </Badge>
                        )}
                    </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Filter</DialogTitle>
                    </DialogHeader>

                    <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2 pr-1">
                        {filters.map((filter) => (
                            <div key={filter.key} className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor={`filter-${filter.key}`}>{filter.label}</Label>

                                    {filter.type === 'number' && (
                                        <ToggleGroup
                                            type="single"
                                            size="sm"
                                            value={draft[filter.key]?.mode ?? 'exact'}
                                            onValueChange={(mode) => mode && setNumberMode(filter, mode)}
                                            className="h-7 gap-0 overflow-hidden rounded-md border"
                                        >
                                            <ToggleGroupItem
                                                value="exact"
                                                className="h-7 rounded-none px-2 text-xs capitalize data-[state=on]:bg-vw-blue data-[state=on]:text-white"
                                            >
                                                Exact
                                            </ToggleGroupItem>
                                            <ToggleGroupItem
                                                value="range"
                                                className="h-7 rounded-none px-2 text-xs capitalize data-[state=on]:bg-vw-blue data-[state=on]:text-white"
                                            >
                                                Range
                                            </ToggleGroupItem>
                                        </ToggleGroup>
                                    )}

                                    {filter.type === 'date' && (
                                        <ToggleGroup
                                            type="single"
                                            size="sm"
                                            value={draft[filter.key]?.mode ?? 'preset'}
                                            onValueChange={(mode) => mode && setDateMode(filter, mode)}
                                            className="h-7 gap-0 overflow-hidden rounded-md border"
                                        >
                                            <ToggleGroupItem
                                                value="preset"
                                                className="h-7 rounded-none px-2 text-xs capitalize data-[state=on]:bg-vw-blue data-[state=on]:text-white"
                                            >
                                                Preset
                                            </ToggleGroupItem>
                                            <ToggleGroupItem
                                                value="range"
                                                className="h-7 rounded-none px-2 text-xs capitalize data-[state=on]:bg-vw-blue data-[state=on]:text-white"
                                            >
                                                Custom
                                            </ToggleGroupItem>
                                        </ToggleGroup>
                                    )}
                                </div>

                                {filter.type === 'select' && (
                                    <Select
                                        value={draft[filter.key] || undefined}
                                        onValueChange={(value) => handleDraftChange(filter.key, value === '__all__' ? '' : value)}
                                    >
                                        <SelectTrigger id={`filter-${filter.key}`}>
                                            <SelectValue
                                                placeholder={filter.placeholder ?? `All ${filter.label}`}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">{filter.placeholder ?? `All ${filter.label}`}</SelectItem>
                                            {(filter.options ?? []).map(normalizeOption).map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {filter.type === 'text' && (
                                    <Input id={`filter-${filter.key}`}
                                        value={draft[filter.key] ?? ''}
                                        placeholder={filter.placeholder ?? `Search ${filter.label}`}
                                        onChange={(e) => handleDraftChange(filter.key, e.target.value)}
                                    />
                                )}

                                {filter.type === 'number' &&
                                    (draft[filter.key]?.mode ?? 'exact') === 'exact' && (
                                        <Input id={`filter-${filter.key}`}
                                            type="number"
                                            placeholder={filter.placeholder ?? filter.label}
                                            value={draft[filter.key]?.value ?? ''}
                                            onChange={(e) =>
                                                handleDraftChange(filter.key, {
                                                    ...draft[filter.key],
                                                    mode: 'exact',
                                                    value: e.target.value,
                                                })
                                            }
                                        />
                                    )}

                                {filter.type === 'number' &&
                                    draft[filter.key]?.mode === 'range' && (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                placeholder="From"
                                                value={draft[filter.key]?.from ?? ''}
                                                onChange={(e) =>
                                                    handleDraftChange(filter.key, {
                                                        ...draft[filter.key],
                                                        mode: 'range',
                                                        from: e.target.value,
                                                    })
                                                }
                                            />
                                            <span className="text-sm text-muted-foreground">–</span>
                                            <Input
                                                type="number"
                                                placeholder="To"
                                                value={draft[filter.key]?.to ?? ''}
                                                onChange={(e) =>
                                                    handleDraftChange(filter.key, {
                                                        ...draft[filter.key],
                                                        mode: 'range',
                                                        to: e.target.value,
                                                    })
                                                }
                                            />
                                        </div>
                                    )}

                                {filter.type === 'date' &&
                                    (draft[filter.key]?.mode ?? 'preset') === 'preset' && (
                                        <Select
                                            value={draft[filter.key]?.preset ?? 'all'}
                                            onValueChange={(preset) =>
                                                handleDraftChange(filter.key, {
                                                    ...draft[filter.key],
                                                    mode: 'preset',
                                                    preset,
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select period" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(filter.presetOptions ?? []).map((option) => (
                                                    <SelectItem key={option.key} value={option.key}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                {filter.type === 'date' && draft[filter.key]?.mode === 'range' && (
                                    <div className="flex items-center gap-2">
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full justify-start gap-2 font-normal"
                                                >
                                                    <CalendarIcon className="h-3.5 w-3.5" />
                                                    {draft[filter.key]?.from || 'From'}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={
                                                        draft[filter.key]?.from
                                                            ? fromLocalISODate(draft[filter.key].from)
                                                            : undefined
                                                    }
                                                    onSelect={(date) =>
                                                        handleDraftChange(filter.key, {
                                                            ...draft[filter.key],
                                                            mode: 'range',
                                                            from: date ? toLocalISODate(date) : '',
                                                        })
                                                    }
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <span className="text-sm text-muted-foreground">–</span>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full justify-start gap-2 font-normal"
                                                >
                                                    <CalendarIcon className="h-3.5 w-3.5" />
                                                    {draft[filter.key]?.to || 'To'}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={
                                                        draft[filter.key]?.to
                                                            ? fromLocalISODate(draft[filter.key].to)
                                                            : undefined
                                                    }
                                                    onSelect={(date) =>
                                                        handleDraftChange(filter.key, {
                                                            ...draft[filter.key],
                                                            mode: 'range',
                                                            to: date ? toLocalISODate(date) : '',
                                                        })
                                                    }
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Section Columns — cuma muncul kalau prop `table` dikirim.
                            Toggle visibility APPLY INSTAN (bukan lewat draft/OK) karena
                            ini preferensi tampilan lokal, bukan filter server-side. */}
                        {table && (
                            <div className="space-y-1.5 border-t pt-4">
                                <Label>Columns</Label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {table
                                        .getAllColumns()
                                        .filter((column) => column.getCanHide())
                                        .map((column) => {
                                            const isVisible = column.getIsVisible();
                                            return (
                                                <button
                                                    key={column.id}
                                                    type="button"
                                                    aria-pressed={isVisible}
                                                    disabled={isVisible && table.getVisibleLeafColumns().length <= 1}
                                                    onClick={() => column.toggleVisibility(!isVisible)}
                                                    className={cn(
                                                        'flex min-h-[40px] items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50',
                                                        isVisible
                                                            ? 'border-vw-blue bg-vw-blue/5'
                                                            : 'border-input hover:bg-vw-grey-light/60'
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                                                            isVisible
                                                                ? 'border-vw-blue bg-vw-blue text-white'
                                                                : 'border-input'
                                                        )}
                                                    >
                                                        {isVisible && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="truncate">
                                                        {column.columnDef.meta?.label ?? column.id}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button type="button" variant="ghost" onClick={handleClearDraft}>
                            Clear all filters
                        </Button>
                        <Button type="button" onClick={handleApply}>
                            OK
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {activeChips.map((chip) => {
                const filter = findFilterDef(chip.key);
                return (
                    <Badge key={chip.key} variant="secondary" className="gap-1">
                        {chip.label}
                        <button
                            type="button"
                            onClick={() => handleRemoveChip(filter)}
                            className="-mr-1.5 ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-urgent"
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