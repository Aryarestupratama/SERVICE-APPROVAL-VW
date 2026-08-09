import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, Head } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Badge } from '@/Components/ui/badge';
import { Separator } from '@/Components/ui/separator';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
} from '@/Components/ui/card';
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
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/Components/ui/command';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/Components/ui/accordion';
import { Alert, AlertTitle, AlertDescription } from '@/Components/ui/alert';
import { Check, ChevronsUpDown, Plus, Trash2, Pencil, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

function EntityCombobox({ items, value, onSelect, placeholder, getLabel, getSubLabel }) {
    const [open, setOpen] = useState(false);
    const selected = items.find((item) => item.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selected ? getLabel(selected) : placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {items.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${getLabel(item)} ${getSubLabel?.(item) ?? ''}`}
                                    onSelect={() => {
                                        onSelect(item.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            value === item.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <div>
                                        <p>{getLabel(item)}</p>
                                        {getSubLabel && (
                                            <p className="text-xs text-vw-grey">{getSubLabel(item)}</p>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// Input harga dengan pemisah ribuan real-time (mis. 10.000.000) supaya SA
// tidak salah hitung jumlah nol. Nilai yang dikirim ke form state tetap angka
// murni tanpa titik (string of digits) — kompatibel langsung dengan validasi
// backend 'numeric' (lihat ServiceOrderController::store()).
function CurrencyInput({ id, value, onChange, placeholder }) {
    const formatDisplay = (val) => {
        const digits = String(val ?? '').replace(/\D/g, '');
        if (digits === '') return '';
        return new Intl.NumberFormat('id-ID').format(Number(digits));
    };

    const [display, setDisplay] = useState(formatDisplay(value));

    useEffect(() => {
        setDisplay(formatDisplay(value));
    }, [value]);

    const handleChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '');
        setDisplay(formatDisplay(digits));
        onChange(digits);
    };

    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-vw-grey">
                Rp
            </span>
            <Input
                id={id}
                inputMode="numeric"
                value={display}
                onChange={handleChange}
                placeholder={placeholder}
                className="pl-9"
            />
        </div>
    );
}

// Format angka jadi Rupiah untuk tampilan ringkasan (bukan input).
function formatIDR(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

// Ubah 'related' -> 'Related', 'work_in_progress' -> 'Work In Progress', dst.
function formatGroupLabel(group) {
    return group
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Subtotal per item SEBELUM PPN — tampilan saja. final_price_snapshot
// (dengan PPN) tetap dihitung & dikunci di backend saat item di-approve.
function itemSubtotal(item) {
    const costItem = Number(item.cost_item) || 0;
    const costLabour = Number(item.cost_labour) || 0;
    const discItem = Number(item.discount_item_percent) || 0;
    const discLabour = Number(item.discount_labour_percent) || 0;

    const netItem = costItem * (1 - discItem / 100);
    const netLabour = costLabour * (1 - discLabour / 100);

    return netItem + netLabour;
}

const emptyItemDraft = (defaultGroup) => ({
    name: '',
    description: '',
    cost_item: '',
    cost_labour: '',
    discount_item_percent: '',
    discount_labour_percent: '',
    group: defaultGroup ?? '',
});

// Field set item — dipakai bareng untuk form "Add Item" di atas maupun mode
// edit inline per item di dalam accordion, supaya layoutnya konsisten.
function ItemFields({ item, groups, errors, errorPrefix, onChange }) {
    const err = (field) => (errorPrefix ? errors?.[`${errorPrefix}.${field}`] : null);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
                <Label>Item Name</Label>
                <Input
                    value={item.name}
                    onChange={(e) => onChange('name', e.target.value)}
                    placeholder="e.g. Brake pad replacement"
                />
                {err('name') && <p className="text-sm text-urgent">{err('name')}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label>Description (optional)</Label>
                <Textarea
                    value={item.description}
                    onChange={(e) => onChange('description', e.target.value)}
                    rows={2}
                />
            </div>

            <div className="space-y-1.5">
                <Label>Labour Price</Label>
                <CurrencyInput
                    value={item.cost_labour}
                    onChange={(v) => onChange('cost_labour', v)}
                    placeholder="0"
                />
                {err('cost_labour') && <p className="text-sm text-urgent">{err('cost_labour')}</p>}
            </div>
            <div className="space-y-1.5">
                <Label>Part Price</Label>
                <CurrencyInput
                    value={item.cost_item}
                    onChange={(v) => onChange('cost_item', v)}
                    placeholder="0"
                />
                {err('cost_item') && <p className="text-sm text-urgent">{err('cost_item')}</p>}
            </div>

            <div className="space-y-1.5">
                <Label>Labour Discount (%)</Label>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount_labour_percent}
                    onChange={(e) => onChange('discount_labour_percent', e.target.value)}
                />
                {err('discount_labour_percent') && (
                    <p className="text-sm text-urgent">{err('discount_labour_percent')}</p>
                )}
            </div>
            <div className="space-y-1.5">
                <Label>Part Discount (%)</Label>
                <Input
                    type="number"
                    min="0"
                    max="100"
                    value={item.discount_item_percent}
                    onChange={(e) => onChange('discount_item_percent', e.target.value)}
                />
                {err('discount_item_percent') && (
                    <p className="text-sm text-urgent">{err('discount_item_percent')}</p>
                )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
                <Label>Group</Label>
                <Select value={item.group} onValueChange={(v) => onChange('group', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                        {groups.map((g) => (
                            <SelectItem key={g} value={g}>
                                {formatGroupLabel(g)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {err('group') && <p className="text-sm text-urgent">{err('group')}</p>}
            </div>
        </div>
    );
}

// Baris item di dalam accordion — mode ringkas (default) atau edit inline.
function ItemRow({ item, index, groups, errors, onUpdate, onRemove, canRemove }) {
    const [editing, setEditing] = useState(false);

    if (editing) {
        return (
            <div className="space-y-3 rounded-md border border-vw-grey/30 bg-vw-grey-light/40 p-4">
                <ItemFields
                    item={item}
                    groups={groups}
                    errors={errors}
                    errorPrefix={`inspection_items.${index}`}
                    onChange={(field, value) => onUpdate(index, field, value)}
                />
                <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={() => setEditing(false)}>
                        Done
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start justify-between gap-4 rounded-md border border-vw-grey/20 p-3">
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{item.name || 'Untitled item'}</p>
                {item.description && (
                    <p className="truncate text-xs text-vw-grey">{item.description}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-vw-grey">
                    <span>Labour: {formatIDR(item.cost_labour)}</span>
                    <span>Part: {formatIDR(item.cost_item)}</span>
                    {Number(item.discount_labour_percent) > 0 && (
                        <span>Labour disc. {item.discount_labour_percent}%</span>
                    )}
                    {Number(item.discount_item_percent) > 0 && (
                        <span>Part disc. {item.discount_item_percent}%</span>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                    {formatIDR(itemSubtotal(item))}
                </span>
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-vw-light-blue"
                    aria-label="Edit item"
                >
                    <Pencil className="h-4 w-4" />
                </button>
                {canRemove && (
                    <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="text-urgent"
                        aria-label="Remove item"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function Create({ customers, vehicles, technicians, brands, groups }) {
    const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
    const [vehicleMode, setVehicleMode] = useState('existing');
    const [draft, setDraft] = useState(emptyItemDraft(groups?.[0]));

    // FIX (audit kolom `year`): key 'year' DIHAPUS dari new_vehicle. Kolom
    // `year` sudah di-drop dari tabel vehicles — field ini sebelumnya
    // dikirim ke backend tapi diam-diam dibuang (backend tidak lagi punya
    // validation rule untuknya), jadi user mengisi field yang tidak
    // berpengaruh sama sekali. Dihapus total supaya tidak menyesatkan.
    const { data, setData, post, processing, errors, transform } = useForm({
        work_order_number: '',
        customer_id: '',
        new_customer: { name: '', phone: '', email: '' },
        vehicle_id: '',
        new_vehicle: { plate_number: '', brand: '', vin: '', model: '' },
        technician_id: '',
        personal_message: '',
        inspection_fee: '',
        inspection_fee_note: '',
        inspection_items: [],
        // Skema baru: 1 video utama saja (link ATAU upload). Video lain (jika
        // ada) dikirim manual ke WhatsApp customer — lihat note di Card Video.
        video: { video_source: 'external_link', video_url: '', file: null },
    });

    // Reset pilihan vehicle setiap kali customer/mode berubah,
    // supaya tidak nyangkut nunjuk ke kendaraan customer lain
    useEffect(() => {
        setData('vehicle_id', '');
    }, [data.customer_id, customerMode]);

    const filteredVehicles =
        customerMode === 'existing' && data.customer_id
            ? vehicles.filter((v) =>
                (v.customers ?? []).some((c) => c.id === data.customer_id)
            )
            : [];

    // Transform payload sebelum dikirim ke backend.
    transform((data) => ({
        ...data,
        customer_id: customerMode === 'existing' ? data.customer_id : '',
        new_customer: customerMode === 'new' ? data.new_customer : null,
        vehicle_id: vehicleMode === 'existing' ? data.vehicle_id : '',
        new_vehicle: vehicleMode === 'new' ? data.new_vehicle : null,
        inspection_items: data.inspection_items,
        // Hanya kirim video kalau benar-benar diisi (url atau file) — video
        // tetap opsional, slot kosong tidak perlu memicu validasi backend.
        videos: data.video.video_url || data.video.file ? [data.video] : [],
    }));

    const updateDraft = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

    const handleAddItem = () => {
        if (!draft.name.trim()) return;
        setData('inspection_items', [...data.inspection_items, draft]);
        setDraft(emptyItemDraft(groups?.[0]));
    };

    const removeItem = (index) => {
        setData(
            'inspection_items',
            data.inspection_items.filter((_, i) => i !== index)
        );
    };

    const updateItem = (index, field, value) => {
        const items = [...data.inspection_items];
        items[index] = { ...items[index], [field]: value };
        setData('inspection_items', items);
    };

    const updateVideo = (field, value) => {
        setData('video', { ...data.video, [field]: value });
    };

    const itemsByGroup = useMemo(() => {
        const map = {};
        data.inspection_items.forEach((item, index) => {
            const g = item.group || 'ungrouped';
            if (!map[g]) map[g] = [];
            map[g].push({ item, index });
        });
        return map;
    }, [data.inspection_items]);

    const totalCost = data.inspection_items.reduce(
        (sum, item) => sum + itemSubtotal(item),
        0
    );
    const feeAmount = Number(data.inspection_fee) || 0;
    const estimatedTotal = totalCost + feeAmount;

    const handleSubmit = (e) => {
        e.preventDefault();
        post(route('admin.service-orders.store'), {
            forceFormData: true, // wajib true karena ada kemungkinan file video
        });
    };

    return (
        <AdminLayout title="New Service Order">
            <Head title="New Service Order" />
            <form onSubmit={handleSubmit}>
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Kolom kiri — input utama */}
                    <div className="space-y-6 lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Work Order</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-w-sm space-y-1.5">
                                    <Label>Work Order Number</Label>
                                    <Input
                                        value={data.work_order_number}
                                        onChange={(e) => setData('work_order_number', e.target.value)}
                                        placeholder="e.g. WO-2026-0001"
                                    />
                                    {errors.work_order_number && (
                                        <p className="text-sm text-urgent">{errors.work_order_number}</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Customer & Vehicle bersebelahan biar hemat ruang di layar lebar */}
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Customer</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={customerMode === 'existing' ? 'default' : 'outline'}
                                            onClick={() => setCustomerMode('existing')}
                                        >
                                            Existing
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={customerMode === 'new' ? 'default' : 'outline'}
                                            onClick={() => setCustomerMode('new')}
                                        >
                                            <Plus className="mr-1 h-4 w-4" /> New
                                        </Button>
                                    </div>

                                    {customerMode === 'existing' ? (
                                        <div className="space-y-1.5">
                                            <Label>Select Customer</Label>
                                            <EntityCombobox
                                                items={customers}
                                                value={data.customer_id}
                                                onSelect={(id) => setData('customer_id', id)}
                                                placeholder="Search customer..."
                                                getLabel={(c) => c.name}
                                                getSubLabel={(c) => c.phone}
                                            />
                                            {errors.customer_id && (
                                                <p className="text-sm text-urgent">{errors.customer_id}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label>Name</Label>
                                                <Input
                                                    value={data.new_customer.name}
                                                    onChange={(e) =>
                                                        setData('new_customer', {
                                                            ...data.new_customer,
                                                            name: e.target.value,
                                                        })
                                                    }
                                                />
                                                {errors['new_customer.name'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_customer.name']}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Phone</Label>
                                                <Input
                                                    value={data.new_customer.phone}
                                                    onChange={(e) =>
                                                        setData('new_customer', {
                                                            ...data.new_customer,
                                                            phone: e.target.value,
                                                        })
                                                    }
                                                />
                                                {errors['new_customer.phone'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_customer.phone']}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Email (optional)</Label>
                                                <Input
                                                    type="email"
                                                    value={data.new_customer.email}
                                                    onChange={(e) =>
                                                        setData('new_customer', {
                                                            ...data.new_customer,
                                                            email: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Vehicle</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={vehicleMode === 'existing' ? 'default' : 'outline'}
                                            onClick={() => setVehicleMode('existing')}
                                        >
                                            Existing
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={vehicleMode === 'new' ? 'default' : 'outline'}
                                            onClick={() => setVehicleMode('new')}
                                        >
                                            <Plus className="mr-1 h-4 w-4" /> New
                                        </Button>
                                    </div>

                                    {vehicleMode === 'existing' ? (
                                        <div className="space-y-1.5">
                                            <Label>Select Vehicle</Label>
                                            {customerMode === 'new' ? (
                                                <p className="text-sm text-vw-grey">
                                                    New customers don't have any vehicles yet — add one below.
                                                </p>
                                            ) : !data.customer_id ? (
                                                <p className="text-sm text-vw-grey">
                                                    Select a customer first to see their vehicles.
                                                </p>
                                            ) : filteredVehicles.length === 0 ? (
                                                <p className="text-sm text-vw-grey">
                                                    This customer has no vehicles yet — add one below.
                                                </p>
                                            ) : (
                                                <EntityCombobox
                                                    items={filteredVehicles}
                                                    value={data.vehicle_id}
                                                    onSelect={(id) => setData('vehicle_id', id)}
                                                    placeholder="Search plate number..."
                                                    getLabel={(v) => v.plate_number}
                                                    getSubLabel={(v) => `${v.brand} ${v.model}`}
                                                />
                                            )}
                                            {errors.vehicle_id && (
                                                <p className="text-sm text-urgent">{errors.vehicle_id}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label>Plate Number</Label>
                                                <Input
                                                    value={data.new_vehicle.plate_number}
                                                    onChange={(e) =>
                                                        setData('new_vehicle', {
                                                            ...data.new_vehicle,
                                                            plate_number: e.target.value,
                                                        })
                                                    }
                                                />
                                                {errors['new_vehicle.plate_number'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_vehicle.plate_number']}
                                                    </p>
                                                )}
                                            </div>
                                            {/* FIX (audit kolom `year`): grid 2 kolom Brand+Year
                                                disederhanakan jadi 1 kolom penuh untuk Brand saja
                                                — input "Year (optional)" DIHAPUS total (kolom
                                                sudah di-drop dari tabel vehicles). */}
                                            <div className="space-y-1.5">
                                                <Label>Brand</Label>
                                                <Select
                                                    value={data.new_vehicle.brand}
                                                    onValueChange={(value) =>
                                                        setData('new_vehicle', {
                                                            ...data.new_vehicle,
                                                            brand: value,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Brand" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {brands.map((brand) => (
                                                            <SelectItem key={brand} value={brand}>
                                                                {brand}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {errors['new_vehicle.brand'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_vehicle.brand']}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>VIN/Chasis Number</Label>
                                                <Input
                                                    value={data.new_vehicle.vin}
                                                    maxLength={17}
                                                    onChange={(e) =>
                                                        setData('new_vehicle', {
                                                            ...data.new_vehicle,
                                                            vin: e.target.value.toUpperCase(),
                                                        })
                                                    }
                                                    placeholder="17-character VIN/Chasis Number"
                                                />
                                                {errors['new_vehicle.vin'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_vehicle.vin']}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Model</Label>
                                                <Input
                                                    value={data.new_vehicle.model}
                                                    onChange={(e) =>
                                                        setData('new_vehicle', {
                                                            ...data.new_vehicle,
                                                            model: e.target.value,
                                                        })
                                                    }
                                                />
                                                {errors['new_vehicle.model'] && (
                                                    <p className="text-sm text-urgent">
                                                        {errors['new_vehicle.model']}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Assignment, message & video bersebelahan */}
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Assignment & Message</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label>Chief Technician (optional)</Label>
                                        <Select
                                            value={data.technician_id ? String(data.technician_id) : ''}
                                            onValueChange={(value) => setData('technician_id', value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select chief technician" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {technicians.map((tech) => (
                                                    <SelectItem key={tech.id} value={String(tech.id)}>
                                                        {tech.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Personal Message to Customer (optional)</Label>
                                        <Textarea
                                            value={data.personal_message}
                                            onChange={(e) => setData('personal_message', e.target.value)}
                                            placeholder="A short message shown alongside the video..."
                                            rows={4}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Video</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={data.video.video_source === 'external_link' ? 'default' : 'outline'}
                                            onClick={() => updateVideo('video_source', 'external_link')}
                                        >
                                            Link
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={data.video.video_source === 'upload' ? 'default' : 'outline'}
                                            onClick={() => updateVideo('video_source', 'upload')}
                                        >
                                            Upload
                                        </Button>
                                    </div>

                                    {data.video.video_source === 'external_link' ? (
                                        <div className="space-y-1.5">
                                            <Label>Video URL (optional)</Label>
                                            <Input
                                                value={data.video.video_url}
                                                onChange={(e) => updateVideo('video_url', e.target.value)}
                                                placeholder="https://..."
                                            />
                                            {errors['videos.0.video_url'] && (
                                                <p className="text-sm text-urgent">
                                                    {errors['videos.0.video_url']}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <Label>Video File (optional)</Label>
                                            <Input
                                                type="file"
                                                accept="video/mp4,video/quicktime,video/webm"
                                                onChange={(e) => updateVideo('file', e.target.files[0])}
                                            />
                                            {errors['videos.0.file'] && (
                                                <p className="text-sm text-urgent">{errors['videos.0.file']}</p>
                                            )}
                                        </div>
                                    )}

                                    <Alert>
                                        <Info className="h-4 w-4" />
                                        <AlertTitle className="text-sm">Only one video here</AlertTitle>
                                        <AlertDescription className="text-xs">
                                            Any additional videos will be sent directly to the customer's
                                            WhatsApp instead of being attached to this report.
                                        </AlertDescription>
                                    </Alert>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Inspection Items */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Inspection Items</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="rounded-md border border-dashed border-vw-grey/40 p-4">
                                    <p className="mb-3 text-sm font-medium text-gray-900">Add Item</p>
                                    <ItemFields
                                        item={draft}
                                        groups={groups}
                                        errors={{}}
                                        errorPrefix={null}
                                        onChange={updateDraft}
                                    />
                                    <div className="mt-3 flex justify-end">
                                        <Button
                                            type="button"
                                            onClick={handleAddItem}
                                            disabled={!draft.name.trim()}
                                        >
                                            <Plus className="mr-1 h-4 w-4" /> Add Item
                                        </Button>
                                    </div>
                                </div>

                                {errors.inspection_items && (
                                    <p className="text-sm text-urgent">{errors.inspection_items}</p>
                                )}

                                {data.inspection_items.length === 0 ? (
                                    <p className="text-sm text-vw-grey">No items added yet.</p>
                                ) : (
                                    <Accordion
                                        type="multiple"
                                        defaultValue={Object.keys(itemsByGroup)}
                                        className="space-y-2"
                                    >
                                        {Object.entries(itemsByGroup).map(([group, entries]) => {
                                            const subtotal = entries.reduce(
                                                (sum, { item }) => sum + itemSubtotal(item),
                                                0
                                            );
                                            return (
                                                <AccordionItem
                                                    key={group}
                                                    value={group}
                                                    className="rounded-md border border-vw-grey/20 px-3"
                                                >
                                                    <AccordionTrigger className="hover:no-underline">
                                                        <div className="flex flex-1 items-center justify-between pr-2">
                                                            <span className="flex items-center gap-2 font-medium text-gray-900">
                                                                {formatGroupLabel(group)}
                                                                <Badge variant="secondary">{entries.length}</Badge>
                                                            </span>
                                                            <span className="text-sm text-vw-grey">
                                                                {formatIDR(subtotal)}
                                                            </span>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="space-y-2 pt-1">
                                                        {entries.map(({ item, index }) => (
                                                            <ItemRow
                                                                key={index}
                                                                item={item}
                                                                index={index}
                                                                groups={groups}
                                                                errors={errors}
                                                                onUpdate={updateItem}
                                                                onRemove={removeItem}
                                                                canRemove={data.inspection_items.length > 1}
                                                            />
                                                        ))}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            );
                                        })}
                                    </Accordion>
                                )}
                            </CardContent>
                        </Card>

                        {/* Inspection Fee */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Inspection Fee</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>Fee Amount</Label>
                                    <CurrencyInput
                                        value={data.inspection_fee}
                                        onChange={(v) => setData('inspection_fee', v)}
                                        placeholder="0"
                                    />
                                    {errors.inspection_fee && (
                                        <p className="text-sm text-urgent">{errors.inspection_fee}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label>Fee Note (reason for this fee)</Label>
                                    <Textarea
                                        value={data.inspection_fee_note}
                                        onChange={(e) => setData('inspection_fee_note', e.target.value)}
                                        rows={2}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Kolom kanan — ringkasan & submit, sticky supaya tetap
                        terlihat selagi scroll form yang panjang di kiri */}
                    <div className="lg:col-span-1">
                        <div className="lg:sticky lg:top-6 space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Order Summary</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-vw-grey">Items</span>
                                        <span>{data.inspection_items.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-vw-grey">Items Subtotal</span>
                                        <span>{formatIDR(totalCost)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-vw-grey">Inspection Fee</span>
                                        <span>{formatIDR(feeAmount)}</span>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between font-semibold text-gray-900">
                                        <span>Estimated Total</span>
                                        <span>{formatIDR(estimatedTotal)}</span>
                                    </div>
                                    <p className="text-xs text-vw-grey">
                                        Before tax. VAT and final per-item price are calculated and
                                        locked once the customer approves each item.
                                    </p>
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" disabled={processing} className="w-full">
                                        {processing ? 'Creating...' : 'Create Service Order'}
                                    </Button>
                                </CardFooter>
                            </Card>
                        </div>
                    </div>
                </div>
            </form>
        </AdminLayout>
    );
}