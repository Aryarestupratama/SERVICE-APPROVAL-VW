import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Checkbox } from '@/Components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
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
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
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

export default function Create({ customers, vehicles, technicians }) {
    const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
    const [vehicleMode, setVehicleMode] = useState('existing');

    const { data, setData, post, processing, errors } = useForm({
        customer_id: '',
        new_customer: { name: '', phone: '', email: '' },
        vehicle_id: '',
        new_vehicle: { plate_number: '', brand: '', model: '', year: '' },
        technician_id: '',
        personal_message: '',
        inspection_fee: '',
        inspection_fee_note: '',
        inspection_items: [{ name: '', description: '', cost: '', is_urgent: false }],
        videos: [],
    });

    const addItem = () => {
        setData('inspection_items', [
            ...data.inspection_items,
            { name: '', description: '', cost: '', is_urgent: false },
        ]);
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

    const addVideo = () => {
        setData('videos', [
            ...data.videos,
            { video_source: 'external_link', video_url: '', file: null },
        ]);
    };

    const removeVideo = (index) => {
        setData(
            'videos',
            data.videos.filter((_, i) => i !== index)
        );
    };

    const updateVideo = (index, field, value) => {
        const videos = [...data.videos];
        videos[index] = { ...videos[index], [field]: value };
        setData('videos', videos);
    };

    const totalCost = data.inspection_items.reduce(
        (sum, item) => sum + (Number(item.cost) || 0),
        0
    );

    const handleSubmit = (e) => {
        e.preventDefault();

        // Kalau mode "existing" tapi belum pilih apapun, kosongkan new_* supaya backend validasi benar
        const payload = {
            ...data,
            customer_id: customerMode === 'existing' ? data.customer_id : '',
            new_customer: customerMode === 'new' ? data.new_customer : null,
            vehicle_id: vehicleMode === 'existing' ? data.vehicle_id : '',
            new_vehicle: vehicleMode === 'new' ? data.new_vehicle : null,
        };

        post(route('admin.service-orders.store'), {
            data: payload,
            forceFormData: true, // wajib true karena ada kemungkinan file video
        });
    };

    return (
        <AdminLayout title="New Service Order">
            <form onSubmit={handleSubmit} className="space-y-6 pb-24">
                {/* Customer */}
                <Card>
                    <CardHeader>
                        <CardTitle>Customer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={customerMode === 'existing' ? 'default' : 'outline'}
                                onClick={() => setCustomerMode('existing')}
                            >
                                Existing Customer
                            </Button>
                            <Button
                                type="button"
                                variant={customerMode === 'new' ? 'default' : 'outline'}
                                onClick={() => setCustomerMode('new')}
                            >
                                <Plus className="mr-1 h-4 w-4" /> New Customer
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
                            <div className="grid gap-4 sm:grid-cols-2">
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
                                        <p className="text-sm text-urgent">{errors['new_customer.name']}</p>
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
                                        <p className="text-sm text-urgent">{errors['new_customer.phone']}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
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

                {/* Vehicle */}
                <Card>
                    <CardHeader>
                        <CardTitle>Vehicle</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={vehicleMode === 'existing' ? 'default' : 'outline'}
                                onClick={() => setVehicleMode('existing')}
                            >
                                Existing Vehicle
                            </Button>
                            <Button
                                type="button"
                                variant={vehicleMode === 'new' ? 'default' : 'outline'}
                                onClick={() => setVehicleMode('new')}
                            >
                                <Plus className="mr-1 h-4 w-4" /> New Vehicle
                            </Button>
                        </div>

                        {vehicleMode === 'existing' ? (
                            <div className="space-y-1.5">
                                <Label>Select Vehicle</Label>
                                <EntityCombobox
                                    items={vehicles}
                                    value={data.vehicle_id}
                                    onSelect={(id) => setData('vehicle_id', id)}
                                    placeholder="Search plate number..."
                                    getLabel={(v) => v.plate_number}
                                    getSubLabel={(v) => `${v.brand} ${v.model}`}
                                />
                                {errors.vehicle_id && (
                                    <p className="text-sm text-urgent">{errors.vehicle_id}</p>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2">
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
                                <div className="space-y-1.5">
                                    <Label>Brand</Label>
                                    <Input
                                        value={data.new_vehicle.brand}
                                        onChange={(e) =>
                                            setData('new_vehicle', {
                                                ...data.new_vehicle,
                                                brand: e.target.value,
                                            })
                                        }
                                        placeholder="Volkswagen"
                                    />
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
                                        <p className="text-sm text-urgent">{errors['new_vehicle.model']}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Year (optional)</Label>
                                    <Input
                                        type="number"
                                        value={data.new_vehicle.year}
                                        onChange={(e) =>
                                            setData('new_vehicle', {
                                                ...data.new_vehicle,
                                                year: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Technician & Personal Message */}
                <Card>
                    <CardHeader>
                        <CardTitle>Assignment & Message</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Technician (optional, for records only)</Label>
                            <Select
                                value={data.technician_id ? String(data.technician_id) : ''}
                                onValueChange={(value) => setData('technician_id', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select technician" />
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
                                rows={3}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Videos */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Videos</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={addVideo}>
                            <Plus className="mr-1 h-4 w-4" /> Add Video
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {data.videos.length === 0 && (
                            <p className="text-sm text-vw-grey">No videos added yet.</p>
                        )}
                        {data.videos.map((video, index) => (
                            <div
                                key={index}
                                className="space-y-3 rounded-md border border-vw-grey/20 p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={video.video_source === 'external_link' ? 'default' : 'outline'}
                                            onClick={() => updateVideo(index, 'video_source', 'external_link')}
                                        >
                                            Link
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={video.video_source === 'upload' ? 'default' : 'outline'}
                                            onClick={() => updateVideo(index, 'video_source', 'upload')}
                                        >
                                            Upload
                                        </Button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeVideo(index)}
                                        className="text-urgent"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                {video.video_source === 'external_link' ? (
                                    <div className="space-y-1.5">
                                        <Label>Video URL</Label>
                                        <Input
                                            value={video.video_url}
                                            onChange={(e) => updateVideo(index, 'video_url', e.target.value)}
                                            placeholder="https://..."
                                        />
                                        {errors[`videos.${index}.video_url`] && (
                                            <p className="text-sm text-urgent">
                                                {errors[`videos.${index}.video_url`]}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <Label>Video File</Label>
                                        <Input
                                            type="file"
                                            accept="video/mp4,video/quicktime,video/webm"
                                            onChange={(e) => updateVideo(index, 'file', e.target.files[0])}
                                        />
                                        {errors[`videos.${index}.file`] && (
                                            <p className="text-sm text-urgent">
                                                {errors[`videos.${index}.file`]}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Inspection Items */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Inspection Items</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={addItem}>
                            <Plus className="mr-1 h-4 w-4" /> Add Item
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {errors.inspection_items && (
                            <p className="text-sm text-urgent">{errors.inspection_items}</p>
                        )}
                        {data.inspection_items.map((item, index) => (
                            <div
                                key={index}
                                className="space-y-3 rounded-md border border-vw-grey/20 p-4"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-1.5">
                                        <Label>Item Name</Label>
                                        <Input
                                            value={item.name}
                                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                                            placeholder="e.g. Brake pad replacement"
                                        />
                                        {errors[`inspection_items.${index}.name`] && (
                                            <p className="text-sm text-urgent">
                                                {errors[`inspection_items.${index}.name`]}
                                            </p>
                                        )}
                                    </div>
                                    {data.inspection_items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            className="mt-6 text-urgent"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Description (optional)</Label>
                                    <Textarea
                                        value={item.description}
                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                        rows={2}
                                    />
                                </div>

                                <div className="flex items-end gap-4">
                                    <div className="flex-1 space-y-1.5">
                                        <Label>Cost (IDR)</Label>
                                        <Input
                                            type="number"
                                            value={item.cost}
                                            onChange={(e) => updateItem(index, 'cost', e.target.value)}
                                        />
                                        {errors[`inspection_items.${index}.cost`] && (
                                            <p className="text-sm text-urgent">
                                                {errors[`inspection_items.${index}.cost`]}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 pb-2">
                                        <Checkbox
                                            id={`urgent-${index}`}
                                            checked={item.is_urgent}
                                            onCheckedChange={(checked) =>
                                                updateItem(index, 'is_urgent', Boolean(checked))
                                            }
                                        />
                                        <Label htmlFor={`urgent-${index}`} className="cursor-pointer">
                                            Urgent
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="flex items-center justify-between border-t border-vw-grey/20 pt-3">
                            <p className="font-semibold text-gray-900">Items Total</p>
                            <p className="font-semibold text-gray-900">
                                {new Intl.NumberFormat('id-ID', {
                                    style: 'currency',
                                    currency: 'IDR',
                                    maximumFractionDigits: 0,
                                }).format(totalCost)}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Inspection Fee */}
                <Card>
                    <CardHeader>
                        <CardTitle>Inspection Fee</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Fee Amount (IDR)</Label>
                            <Input
                                type="number"
                                value={data.inspection_fee}
                                onChange={(e) => setData('inspection_fee', e.target.value)}
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

                {/* Sticky submit bar */}
                <div className="fixed inset-x-0 bottom-0 border-t border-vw-grey/20 bg-white p-4 lg:pl-64">
                    <div className="flex justify-end">
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Creating...' : 'Create Service Order'}
                        </Button>
                    </div>
                </div>
            </form>
        </AdminLayout>
    );
}