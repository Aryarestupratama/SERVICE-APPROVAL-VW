import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm } from '@inertiajs/react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';

export default function Edit({ settings }) {
    const { data, setData, post, processing, errors } = useForm({
        workshop_name: settings?.workshop_name ?? '',
        address: settings?.address ?? '',
        phone: settings?.phone ?? '',
        google_maps_url: settings?.google_maps_url ?? '',
        google_maps_embed_url: settings?.google_maps_embed_url ?? '',
        website_url: settings?.website_url ?? '',
        ppn_percent: settings?.ppn_percent ?? '11',
        era_phone: settings?.era_phone ?? '',
        booking_whatsapp_phone: settings?.booking_whatsapp_phone ?? '',
        survey_form_url: settings?.survey_form_url ?? '',
        logo: null,
        hero_image: null,
        _method: 'put',
    });

    const [logoPreview, setLogoPreview] = useState(settings?.logo_path ?? null);
    const [heroPreview, setHeroPreview] = useState(settings?.hero_image_path ?? null);

    const handleFileChange = (field, setPreview) => (e) => {
        const file = e.target.files?.[0] ?? null;
        setData(field, file);
        if (file) setPreview(URL.createObjectURL(file));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // File upload butuh multipart — Inertia post dengan _method spoofing untuk PUT
        post(route('admin.settings.update'), {
            preserveScroll: true,
            forceFormData: true,
        });
    };

    return (
        <AdminLayout title="Workshop Settings">
            <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
                <div className="rounded-lg border border-vw-grey/20 bg-white p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900">General</h2>

                    <div className="space-y-1.5">
                        <Label htmlFor="workshop_name">Workshop Name</Label>
                        <Input
                            id="workshop_name"
                            value={data.workshop_name}
                            onChange={(e) => setData('workshop_name', e.target.value)}
                        />
                        {errors.workshop_name && (
                            <p className="text-sm text-urgent">{errors.workshop_name}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                            id="address"
                            value={data.address}
                            onChange={(e) => setData('address', e.target.value)}
                            rows={3}
                        />
                        {errors.address && <p className="text-sm text-urgent">{errors.address}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                            id="phone"
                            value={data.phone}
                            onChange={(e) => setData('phone', e.target.value)}
                        />
                        {errors.phone && <p className="text-sm text-urgent">{errors.phone}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="google_maps_url">Google Maps URL</Label>
                        <Input
                            id="google_maps_url"
                            value={data.google_maps_url}
                            onChange={(e) => setData('google_maps_url', e.target.value)}
                        />
                        {errors.google_maps_url && (
                            <p className="text-sm text-urgent">{errors.google_maps_url}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="google_maps_embed_url">Google Maps Embed URL (optional)</Label>
                        <Input
                            id="google_maps_embed_url"
                            value={data.google_maps_embed_url}
                            onChange={(e) => setData('google_maps_embed_url', e.target.value)}
                            placeholder="https://www.google.com/maps/embed?pb=..."
                        />
                        {errors.google_maps_embed_url && (
                            <p className="text-sm text-urgent">{errors.google_maps_embed_url}</p>
                        )}
                        <p className="text-xs text-vw-grey">
                            The "src" URL from Google Maps' Embed HTML code, used to show an interactive
                            map on the public report page. Leave empty to show a link-only map.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="website_url">Website URL (optional)</Label>
                        <Input
                            id="website_url"
                            value={data.website_url}
                            onChange={(e) => setData('website_url', e.target.value)}
                        />
                        {errors.website_url && (
                            <p className="text-sm text-urgent">{errors.website_url}</p>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-vw-grey/20 bg-white p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900">Tax</h2>

                    <div className="space-y-1.5">
                        <Label htmlFor="ppn_percent">VAT / PPN (%)</Label>
                        <Input
                            id="ppn_percent"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={data.ppn_percent}
                            onChange={(e) => setData('ppn_percent', e.target.value)}
                            className="max-w-[160px]"
                        />
                        {errors.ppn_percent && (
                            <p className="text-sm text-urgent">{errors.ppn_percent}</p>
                        )}
                        <p className="text-xs text-vw-grey">
                            Applied when calculating the final price of approved inspection items.
                            Changing this does not affect items that are already approved
                            (their price is locked at approval time).
                        </p>
                    </div>
                </div>

                <div className="rounded-lg border border-vw-grey/20 bg-white p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900">Thank You Page</h2>
                    <p className="text-xs text-vw-grey">
                        Shown to customers on the public report page once their order status is
                        "Completed".
                    </p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="era_phone">ERA (Emergency Road Assist) Phone</Label>
                            <Input
                                id="era_phone"
                                value={data.era_phone}
                                onChange={(e) => setData('era_phone', e.target.value)}
                                placeholder="14023"
                            />
                            {errors.era_phone && (
                                <p className="text-sm text-urgent">{errors.era_phone}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="booking_whatsapp_phone">Booking WhatsApp Number</Label>
                            <Input
                                id="booking_whatsapp_phone"
                                value={data.booking_whatsapp_phone}
                                onChange={(e) => setData('booking_whatsapp_phone', e.target.value)}
                                placeholder="62812xxxxxxx"
                            />
                            {errors.booking_whatsapp_phone && (
                                <p className="text-sm text-urgent">{errors.booking_whatsapp_phone}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="survey_form_url">Survey Form URL</Label>
                        <Input
                            id="survey_form_url"
                            value={data.survey_form_url}
                            onChange={(e) => setData('survey_form_url', e.target.value)}
                            placeholder="https://forms.gle/..."
                        />
                        {errors.survey_form_url && (
                            <p className="text-sm text-urgent">{errors.survey_form_url}</p>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-vw-grey/20 bg-white p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900">Branding</h2>

                    <div className="space-y-1.5">
                        <Label htmlFor="logo">Logo</Label>
                        {logoPreview && (
                            <img
                                src={logoPreview.startsWith('blob:') ? logoPreview : `/storage/${logoPreview}`}
                                alt="Logo preview"
                                className="mb-2 h-16 w-16 rounded-md border border-vw-grey/20 object-contain"
                            />
                        )}
                        <Input
                            id="logo"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange('logo', setLogoPreview)}
                        />
                        {errors.logo && <p className="text-sm text-urgent">{errors.logo}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="hero_image">Hero Image (optional)</Label>
                        {heroPreview && (
                            <img
                                src={heroPreview.startsWith('blob:') ? heroPreview : `/storage/${heroPreview}`}
                                alt="Hero preview"
                                className="mb-2 h-24 w-full rounded-md border border-vw-grey/20 object-cover"
                            />
                        )}
                        <Input
                            id="hero_image"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange('hero_image', setHeroPreview)}
                        />
                        {errors.hero_image && (
                            <p className="text-sm text-urgent">{errors.hero_image}</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button type="submit" disabled={processing}>
                        {processing ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </form>
        </AdminLayout>
    );
}