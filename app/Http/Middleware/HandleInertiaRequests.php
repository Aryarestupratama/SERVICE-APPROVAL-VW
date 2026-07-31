<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user(),
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
            // Notifikasi in-app (follow-up reminder & escalation) — cuma
            // di-load kalau user sedang login, biar halaman publik/guest
            // (login page dll) nggak ikut query notifications tiap request.
            'notifications' => fn () => $request->user()
                ? [
                    'unread_count' => $request->user()->unreadNotifications()->count(),
                    // Batasi 10 terbaru (dicampur read+unread) biar dropdown
                    // nggak berat — kalau butuh full history nanti bisa
                    // dibuatkan halaman terpisah.
                    'items' => $request->user()->notifications()->latest()->limit(10)->get()
                        ->map(fn ($n) => [
                            'id' => $n->id,
                            'type' => $n->data['type'] ?? null,
                            'message' => $n->data['message'] ?? '',
                            'service_order_id' => $n->data['service_order_id'] ?? null,
                            'read_at' => $n->read_at,
                            'created_at' => $n->created_at,
                        ]),
                ]
                : ['unread_count' => 0, 'items' => []],
        ];
    }
}