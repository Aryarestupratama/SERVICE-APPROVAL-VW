<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $search = $request->string('search')->toString();

        $sortMap = ['name' => 'name', 'email' => 'email', 'phone' => 'phone', 'role' => 'role'];
        $sortCol = $sortMap[$request->string('sort_by')->toString()] ?? null;
        $sortDir = $request->string('sort_dir')->toString() === 'desc' ? 'desc' : 'asc';

        $users = User::query()
            ->when($search, function ($query) use ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when($request->role, fn ($q, $role) =>
                $q->where('role', $role)
            )
            ->when(
                $sortCol,
                fn ($q) => $q->orderBy($sortCol, $sortDir)->orderBy('id'),
                fn ($q) => $q->orderBy('name')
            )
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'search' => $search,
            'filters' => $request->only(['role', 'sort_by', 'sort_dir']),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'role' => ['required', Rule::in(['admin', 'service_advisor', 'chief_technician'])],
            'password' => ['required', 'string', 'min:8'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ]);

        $validated['password'] = Hash::make($validated['password']);

        if ($request->hasFile('photo')) {
            $validated['photo_path'] = $request->file('photo')->store('users', 'public');
        }
        unset($validated['photo']);

        User::create($validated);

        return back()->with('success', 'Staff account created.');
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'role' => ['required', Rule::in(['admin', 'service_advisor', 'chief_technician'])],
            'password' => ['nullable', 'string', 'min:8'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ]);

        // Cegah admin mengunci dirinya sendiri / sistem tanpa admin.
        if ($validated['role'] !== $user->role) {
            if ($user->id === $request->user()->id) {
                return back()->withErrors(['role' => 'You cannot change your own role.']);
            }
            if ($user->role === 'admin' && User::where('role', 'admin')->count() <= 1) {
                return back()->withErrors(['role' => 'At least one admin account must remain.']);
            }
        }

        // Password cuma diupdate kalau diisi — kosongin field artinya "tidak diganti"
        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $oldPhotoPath = null;

        if ($request->hasFile('photo')) {
            $oldPhotoPath = $user->photo_path;
            // Simpan file baru DULU — kalau ini gagal, foto lama masih utuh.
            $validated['photo_path'] = $request->file('photo')->store('users', 'public');
        }
        unset($validated['photo']);

        $user->update($validated);

        // Baru hapus foto lama SETELAH file baru + row DB dipastikan berhasil.
        if ($oldPhotoPath) {
            Storage::disk('public')->delete($oldPhotoPath);
        }

        return back()->with('success', 'Staff account updated.');
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return back()->with('error', 'You cannot delete your own account.');
        }

        $photoPath = $user->photo_path;

        try {
            $user->delete();
        } catch (QueryException $e) {
            return back()->with(
                'error',
                'Cannot delete this staff account — it still has related service orders.'
            );
        }

        // Foto dihapus SETELAH baris user benar-benar terhapus. Sebelumnya foto dihapus
        // lebih dulu, sehingga kalau delete ditolak (FK) fotonya hilang tapi akunnya tetap ada.
        if ($photoPath) {
            Storage::disk('public')->delete($photoPath);
        }

        return back()->with('success', 'Staff account deleted.');
    }
}