import { useEffect, useRef } from 'react';
import { router } from '@inertiajs/react';

/**
 * Polling + change-detection generik (PROJECT-RULES.md bagian 12.4).
 *
 * Poll ke `url` tiap `intervalMs` detik, HANYA kalau tab sedang aktif
 * (document.visibilityState === 'visible') — kalau tidak, request di-skip
 * dan dicoba lagi di interval berikutnya begitu tab aktif lagi, supaya tidak
 * buang-buang request saat user pindah tab (12.4 poin 5, 12.5).
 *
 * Endpoint yang dipanggil HARUS super ringan, hanya balikin
 * `{ last_activity_at }` (12.4 poin 3) — bukan data order lengkap. Kalau
 * nilainya berubah dari yang terakhir diketahui, baru trigger
 * `router.reload({ only })` untuk narik data lengkap (12.4 poin 4).
 *
 * @param {Object} opts
 * @param {string} opts.url - endpoint ringan yang balikin { last_activity_at }
 * @param {string|null} opts.initialValue - last_activity_at awal dari props Inertia
 * @param {string[]} opts.only - props yang di-reload lewat router.reload({ only })
 * @param {number} [opts.intervalMs=4000] - interval polling dalam ms
 * @param {boolean} [opts.enabled=true] - matikan polling sepenuhnya kalau false
 */
export function usePollLastActivity({ url, initialValue, only, intervalMs = 4000, enabled = true }) {
    const lastKnownRef = useRef(initialValue ?? null);

    // Kalau Inertia reload datang dari sumber lain (bukan dari polling ini
    // sendiri) dan membawa last_activity_at baru, sinkronkan basis pembanding
    // supaya tidak trigger reload ganda yang sia-sia.
    useEffect(() => {
        lastKnownRef.current = initialValue ?? null;
    }, [initialValue]);

    useEffect(() => {
        if (!enabled) return undefined;

        let timerId;
        let cancelled = false;

        const poll = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const response = await fetch(url, {
                        headers: { Accept: 'application/json' },
                        credentials: 'same-origin',
                    });

                    if (response.ok) {
                        const data = await response.json();

                        if (
                            data.last_activity_at &&
                            data.last_activity_at !== lastKnownRef.current
                        ) {
                            lastKnownRef.current = data.last_activity_at;
                            router.reload({ only });
                        }
                    }
                } catch {
                    // Diamkan — kegagalan sesekali (network blip) tidak fatal,
                    // dicoba lagi otomatis di interval berikutnya.
                }
            }

            if (!cancelled) {
                timerId = setTimeout(poll, intervalMs);
            }
        };

        timerId = setTimeout(poll, intervalMs);

        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [url, intervalMs, enabled, only]);
}