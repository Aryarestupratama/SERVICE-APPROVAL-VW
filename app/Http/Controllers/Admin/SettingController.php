<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class SettingController extends Controller
{
    public function edit()
    {
        $settings = Setting::first();

        return Inertia::render('Admin/Settings/Edit', [
            'settings' => $settings,
        ]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'workshop_name' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string'],
            'phone' => ['required', 'string', 'max:30'],
            'google_maps_url' => ['required', 'url', 'max:500'],
            'google_maps_embed_url' => ['nullable', 'url', 'max:1000'],
            'website_url' => ['nullable', 'url', 'max:500'],
            'ppn_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'hero_image' => ['nullable', 'image', 'max:4096'],

            // Thank You section (Revisi Besar #2, poin 9)
            'era_phone' => ['nullable', 'string', 'max:30'],
            'booking_whatsapp_phone' => ['nullable', 'string', 'max:30'],
            'survey_form_url' => ['nullable', 'url', 'max:500'],
        ]);

        $settings = Setting::first() ?? new Setting();

        $settings->fill([
            'workshop_name' => $validated['workshop_name'],
            'address' => $validated['address'],
            'phone' => $validated['phone'],
            'google_maps_url' => $validated['google_maps_url'],
            'google_maps_embed_url' => $validated['google_maps_embed_url'] ?? null,
            'website_url' => $validated['website_url'] ?? null,
            'ppn_percent' => $validated['ppn_percent'],

            'era_phone' => $validated['era_phone'] ?? null,
            'booking_whatsapp_phone' => $validated['booking_whatsapp_phone'] ?? null,
            'survey_form_url' => $validated['survey_form_url'] ?? null,
        ]);

        $oldLogoPath = null;
        $oldHeroImagePath = null;

        if ($request->hasFile('logo')) {
            $oldLogoPath = $settings->logo_path;
            // Simpan file baru DULU — kalau ini gagal, logo lama masih utuh.
            $settings->logo_path = $request->file('logo')->store('settings', 'public');
        }

        if ($request->hasFile('hero_image')) {
            $oldHeroImagePath = $settings->hero_image_path;
            // Simpan file baru DULU — kalau ini gagal, hero image lama masih utuh.
            $settings->hero_image_path = $request->file('hero_image')->store('settings', 'public');
        }

        $settings->save();

        // Baru hapus file lama SETELAH file baru + row DB dipastikan berhasil.
        if ($oldLogoPath) {
            Storage::disk('public')->delete($oldLogoPath);
        }

        if ($oldHeroImagePath) {
            Storage::disk('public')->delete($oldHeroImagePath);
        }

        return back()->with('success', 'Workshop settings updated.');
    }
}