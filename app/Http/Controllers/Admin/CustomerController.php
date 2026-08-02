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
        $customers = Customer::query()
            ->when($request->search, fn ($q, $search) =>
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
            )
            ->with('vehicles')
            ->latest()
            ->paginate(20);

        return Inertia::render('Admin/Customers/Index', [
            'customers' => $customers,
            'search' => $request->search,
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
}