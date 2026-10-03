<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Illuminate\Database\QueryException;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        // Sort & pencarian di SERVER (sebelumnya sort client-side hanya mengurutkan 20 baris di halaman itu).
        $sortColumns = ['name' => 'name', 'phone' => 'phone', 'email' => 'email', 'vehicles' => 'vehicles_count'];
        $sortBy = $sortColumns[$request->string('sort_by')->toString()] ?? null;
        $sortDir = $request->string('sort_dir')->toString() === 'desc' ? 'desc' : 'asc';

        $customers = Customer::query()
            // Pencarian DIBUNGKUS grup: tanpa ini `OR phone LIKE` lolos dari filter title.
            ->when($request->search, fn ($q, $search) =>
                $q->where(fn ($w) => $w
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    // DB menyimpan 62xxx; pencarian "0812…" harus tetap ketemu.
                    ->when(
                        preg_match('/^[\d\s+\-()]+$/', $search) && self::canonicalPhone($search) !== '',
                        fn ($w2) => $w2->orWhere('phone', 'like', '%' . self::canonicalPhone($search) . '%')
                    ))
            )
            ->when($request->title, fn ($q, $title) =>
                $q->where('title', $title)
            )
            ->with('vehicles')
            ->withCount('vehicles')
            ->when(
                $sortBy,
                fn ($q) => $q->orderBy($sortBy, $sortDir)->orderBy('id'),
                fn ($q) => $q->latest()
            )
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Admin/Customers/Index', [
            'customers' => $customers,
            'search' => $request->search,
            'filters' => $request->only(['title', 'sort_by', 'sort_dir']),
            'titles' => Customer::TITLES,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'title' => ['nullable', Rule::in(Customer::TITLES)],
            'phone' => ['required', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        $digits = self::canonicalPhone($validated['phone']);
        $duplicate = Customer::whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($validated['name']))])
            ->get()
            ->first(fn ($c) => self::canonicalPhone($c->phone) === $digits);

        if ($duplicate) {
            return back()->withErrors(['name' => 'A customer with this name and phone number already exists.']);
        }

        $customer = Customer::create($validated);

        return back()->with('success', 'Customer berhasil ditambahkan.')->with('customer', $customer);
    }

    public function update(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'title' => ['nullable', Rule::in(Customer::TITLES)],
            'phone' => ['required', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);

        $customer->update($validated);

        return back()->with('success', 'Customer berhasil diperbarui.');
    }

    public function destroy(Customer $customer)
    {
        try {
            $customer->delete();
        } catch (QueryException $e) {
            return back()->with(
                'error',
                'Customer cannot be deleted because they still have related vehicles or service orders.'
            );
        }

        return back()->with('success', 'Customer berhasil dihapus.');
    }

    /**
     * Bentuk kanonik nomor telepon (sama dengan toLocalDigits di Customers/Index.jsx):
     * hanya digit, tanpa awalan 62 atau 0 — supaya "0812…", "+62 812…", dan "812…" dianggap sama.
     */
    private static function canonicalPhone(?string $raw): string
    {
        $digits = preg_replace('/\D+/', '', (string) $raw);
        if (str_starts_with($digits, '62')) {
            return substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
    }
}