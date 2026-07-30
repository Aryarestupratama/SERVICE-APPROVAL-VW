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
            'whatsapp_number' => ['required', 'string', 'max:30'],
            'google_maps_url' => ['required', 'url', 'max:500'],
            'website_url' => ['nullable', 'url', 'max:500'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'hero_image' => ['nullable', 'image', 'max:4096'],
        ]);

        $settings = Setting::first() ?? new Setting();

        $settings->fill([
            'workshop_name' => $validated['workshop_name'],
            'address' => $validated['address'],
            'phone' => $validated['phone'],
            'whatsapp_number' => $validated['whatsapp_number'],
            'google_maps_url' => $validated['google_maps_url'],
            'website_url' => $validated['website_url'] ?? null,
        ]);

        if ($request->hasFile('logo')) {
            if ($settings->logo_path) {
                Storage::disk('public')->delete($settings->logo_path);
            }
            $settings->logo_path = $request->file('logo')->store('settings', 'public');
        }

        if ($request->hasFile('hero_image')) {
            if ($settings->hero_image_path) {
                Storage::disk('public')->delete($settings->hero_image_path);
            }
            $settings->hero_image_path = $request->file('hero_image')->store('settings', 'public');
        }

        $settings->save();

        return back()->with('success', 'Workshop settings updated.');
    }
}