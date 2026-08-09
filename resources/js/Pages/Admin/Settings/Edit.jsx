import { useState } from 'react';
import AdminLayout from '@/Layouts/AdminLayout';
import { useForm, Head } from '@inertiajs/react';
import { toast } from 'sonner';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Textarea } from '@/Components/ui/textarea';
import { Badge } from '@/Components/ui/badge';
import { Separator } from '@/Components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/Components/ui/alert';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/Components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/Components/ui/tabs';
import { ImageIcon, Info, Save } from 'lucide-react';

export default function Edit({ settings }) {
    const { data, setData, post, processing, errors, isDirty } = useForm({
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
        post(route('admin.settings.update'), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => toast.success('Settings saved'),
            onError: () => toast.error('Failed to save — check the form for errors'),
        });
    };

    // Field mana yang errornya ada di tab mana — dipakai buat kasih titik merah
    // di TabsTrigger kalau user submit dan ada error di tab yang lagi ditutup.
    const tabHasError = {
        general: ['workshop_name', 'address', 'phone', 'google_maps_url', 'google_maps_embed_url', 'website_url']
            .some((f) => errors[f]),
        tax_thankyou: ['ppn_percent', 'era_phone', 'booking_whatsapp_phone', 'survey_form_url']
            .some((f) => errors[f]),
        branding: ['logo', 'hero_image'].some((f) => errors[f]),
    };

    return (
        <AdminLayout
            title="Workshop Settings"
            headerActions={
                <Button type="submit" form="settings-form" disabled={processing}>
                    <Save className="mr-1.5 h-4 w-4" />
                    {processing ? 'Saving...' : 'Save Settings'}
                </Button>
            }
        >
            <Head title="Workshop Settings" />
            <form id="settings-form" onSubmit={handleSubmit} className="max-w-3xl">
                <Tabs defaultValue="general" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="general" className="gap-1.5">
                            General
                            {tabHasError.general && <span className="h-1.5 w-1.5 rounded-full bg-urgent" />}
                        </TabsTrigger>
                        <TabsTrigger value="tax_thankyou" className="gap-1.5">
                            Tax & Thank You
                            {tabHasError.tax_thankyou && <span className="h-1.5 w-1.5 rounded-full bg-urgent" />}
                        </TabsTrigger>
                        <TabsTrigger value="branding" className="gap-1.5">
                            Branding
                            {tabHasError.branding && <span className="h-1.5 w-1.5 rounded-full bg-urgent" />}
                        </TabsTrigger>
                    </TabsList>

                    {/* ---------------- General ---------------- */}
                    <TabsContent value="general">
                        <Card>
                            <CardHeader>
                                <CardTitle>Workshop Information</CardTitle>
                                <CardDescription>
                                    Basic details shown to customers and used across the system.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        value={data.phone}
                                        onChange={(e) => setData('phone', e.target.value)}
                                    />
                                    {errors.phone && <p className="text-sm text-urgent">{errors.phone}</p>}
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

                                <Separator />

                                <div className="space-y-1.5">
                                    <Label htmlFor="google_maps_url">Google Maps URL</Label>
                                    <Input
                                        id="google_maps_url"
                                        value={data.google_maps_url}
                                        onChange={(e) => setData('google_maps_url', e.target.value)}
                                        placeholder="https://maps.app.goo.gl/..."
                                    />
                                    {errors.google_maps_url && (
                                        <p className="text-sm text-urgent">{errors.google_maps_url}</p>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="google_maps_embed_url">
                                        Google Maps Embed URL <span className="text-vw-grey">(optional)</span>
                                    </Label>
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
                                        The "src" URL from Google Maps' Embed HTML code, used to show an
                                        interactive map on the public report page. Leave empty to show a
                                        link-only map.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="website_url">
                                        Website URL <span className="text-vw-grey">(optional)</span>
                                    </Label>
                                    <Input
                                        id="website_url"
                                        value={data.website_url}
                                        onChange={(e) => setData('website_url', e.target.value)}
                                    />
                                    {errors.website_url && (
                                        <p className="text-sm text-urgent">{errors.website_url}</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ---------------- Tax & Thank You ---------------- */}
                    <TabsContent value="tax_thankyou" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Tax</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-w-[200px] space-y-1.5">
                                    <Label htmlFor="ppn_percent">VAT / PPN (%)</Label>
                                    <div className="relative">
                                        <Input
                                            id="ppn_percent"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={data.ppn_percent}
                                            onChange={(e) => setData('ppn_percent', e.target.value)}
                                            className="pr-8"
                                        />
                                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-vw-grey">
                                            %
                                        </span>
                                    </div>
                                    {errors.ppn_percent && (
                                        <p className="text-sm text-urgent">{errors.ppn_percent}</p>
                                    )}
                                </div>
                                <Alert className="mt-4">
                                    <Info className="h-4 w-4" />
                                    <AlertTitle className="text-sm">Locked at approval time</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        Applied when calculating the final price of approved inspection
                                        items. Changing this does not affect items that are already
                                        approved.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Thank You Page</CardTitle>
                                <CardDescription>
                                    Shown to customers on the public report page once their order status
                                    is "Completed".
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
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
                                        <Label htmlFor="booking_whatsapp_phone">
                                            Booking WhatsApp Number
                                        </Label>
                                        <Input
                                            id="booking_whatsapp_phone"
                                            value={data.booking_whatsapp_phone}
                                            onChange={(e) =>
                                                setData('booking_whatsapp_phone', e.target.value)
                                            }
                                            placeholder="62812xxxxxxx"
                                        />
                                        {errors.booking_whatsapp_phone && (
                                            <p className="text-sm text-urgent">
                                                {errors.booking_whatsapp_phone}
                                            </p>
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
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ---------------- Branding ---------------- */}
                    <TabsContent value="branding">
                        <Card>
                            <CardHeader>
                                <CardTitle>Branding</CardTitle>
                                <CardDescription>
                                    Logo used in the sidebar & login page, and the hero image shown on
                                    public-facing pages.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="logo">Logo</Label>
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-vw-grey/20 bg-vw-grey-light">
                                            {logoPreview ? (
                                                <img
                                                    src={
                                                        logoPreview.startsWith('blob:')
                                                            ? logoPreview
                                                            : `/storage/${logoPreview}`
                                                    }
                                                    alt="Logo preview"
                                                    className="h-full w-full object-contain"
                                                />
                                            ) : (
                                                <ImageIcon className="h-6 w-6 text-vw-grey" />
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <Input
                                                id="logo"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileChange('logo', setLogoPreview)}
                                            />
                                            {data.logo ? (
                                                <Badge variant="secondary">New — not saved yet</Badge>
                                            ) : (
                                                settings?.logo_path && (
                                                    <Badge variant="outline">Current logo</Badge>
                                                )
                                            )}
                                            {errors.logo && (
                                                <p className="text-sm text-urgent">{errors.logo}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label htmlFor="hero_image">
                                        Hero Image <span className="text-vw-grey">(optional)</span>
                                    </Label>
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-vw-grey/20 bg-vw-grey-light">
                                            {heroPreview ? (
                                                <img
                                                    src={
                                                        heroPreview.startsWith('blob:')
                                                            ? heroPreview
                                                            : `/storage/${heroPreview}`
                                                    }
                                                    alt="Hero preview"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <ImageIcon className="h-6 w-6 text-vw-grey" />
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <Input
                                                id="hero_image"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileChange('hero_image', setHeroPreview)}
                                            />
                                            {data.hero_image ? (
                                                <Badge variant="secondary">New — not saved yet</Badge>
                                            ) : (
                                                settings?.hero_image_path && (
                                                    <Badge variant="outline">Current hero image</Badge>
                                                )
                                            )}
                                            {errors.hero_image && (
                                                <p className="text-sm text-urgent">{errors.hero_image}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Save button juga di-duplikat di bawah form, buat halaman yang
                    panjang / user yang scroll sampai bawah tanpa perlu balik ke
                    header. Form yang sama (id="settings-form") dipakai keduanya. */}
                <div className="mt-6 flex justify-end">
                    <Button type="submit" disabled={processing}>
                        <Save className="mr-1.5 h-4 w-4" />
                        {processing ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </form>
        </AdminLayout>
    );
}