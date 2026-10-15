import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn } from 'lucide-react';

/**
 * Tumpukan foto hasil perbaikan (halaman customer) ala kartu remi.
 *
 * - Foto paling atas bisa digeser (swipe/drag) ke kiri atau kanan; setelah lepas, foto
 *   terbang keluar lalu meluncur ke PALING BELAKANG tumpukan, foto berikutnya naik.
 * - Penghitung "Photo n/total" di atas tumpukan mengikuti foto teratas.
 * - Di bawah tumpukan: petunjuk swipe + petunjuk "tap untuk memperbesar" (dua baris terpisah
 *   supaya tidak bertabrakan) dengan tombol panah di kiri-kanan, lalu
 *   deskripsi foto teratas. Semua deskripsi ditumpuk di satu sel grid supaya tinggi area
 *   deskripsi tetap (tidak ada halaman yang melompat saat berganti foto).
 * - Tap foto (tanpa geser) membuka viewer layar penuh lewat `onOpen({ url, title })`.
 * - Menghormati prefers-reduced-motion: tanpa animasi terbang/luncur.
 *
 * Tanpa library tambahan (Pointer Events + CSS transform).
 */

const MAX_VISIBLE_BEHIND = 3; // kartu di belakang yang masih terlihat
const SWIPE_DISTANCE = 90; // px
const SWIPE_VELOCITY = 0.45; // px/ms
const TAP_SLOP = 8; // px: di bawah ini dianggap tap
const FLY_MS = 220;
const SETTLE_MS = 380;
const EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)';

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(mq.matches);
        update();
        mq.addEventListener?.('change', update);
        return () => mq.removeEventListener?.('change', update);
    }, []);
    return reduced;
}

// Posisi kartu di tumpukan (p = 0 teratas). Kartu selang-seling miring sedikit supaya
// terlihat seperti setumpuk foto, bukan kotak yang persis menimpa.
function restingTransform(p, progress = 0) {
    const depth = Math.min(p, MAX_VISIBLE_BEHIND);
    const lift = p === 1 ? progress : 0; // kartu kedua naik pelan saat teratas digeser
    const scale = 1 - depth * 0.05 + lift * 0.05;
    const y = depth * 12 - lift * 12;
    const rot = depth === 0 ? 0 : (depth % 2 === 1 ? 2.2 : -2.2) * (1 - lift);
    return { scale, y, rot };
}

export default function RepairImageStack({ images, onOpen }) {
    const count = images.length;
    const reducedMotion = usePrefersReducedMotion();

    // order[0] = indeks foto teratas.
    const [order, setOrder] = useState(() => images.map((_, i) => i));
    const [drag, setDrag] = useState({ x: 0, active: false });
    const [flying, setFlying] = useState(null); // { dir: -1 | 1 } | null
    const busyRef = useRef(false);
    const gestureRef = useRef(null);
    const timerRef = useRef(null);

    // Daftar foto berubah (SA menambah/menghapus saat customer membuka halaman, via polling).
    const signature = images.map((i) => i.id).join(',');
    useEffect(() => {
        setOrder((prev) => {
            const valid = prev.filter((i) => i < count);
            const missing = images.map((_, i) => i).filter((i) => !valid.includes(i));
            return [...valid, ...missing];
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const topIndex = order[0] ?? 0;
    const position = order.indexOf(topIndex) >= 0 ? topIndex + 1 : 1;

    const advance = useCallback(
        (dir) => {
            if (count < 2 || busyRef.current) return;
            busyRef.current = true;
            const finish = () => {
                setOrder((prev) => [...prev.slice(1), prev[0]]);
                setFlying(null);
                setDrag({ x: 0, active: false });
                // Beri waktu kartu meluncur ke belakang sebelum swipe berikutnya.
                timerRef.current = setTimeout(
                    () => {
                        busyRef.current = false;
                    },
                    reducedMotion ? 0 : SETTLE_MS * 0.6
                );
            };
            if (reducedMotion) {
                finish();
                return;
            }
            setFlying({ dir });
            timerRef.current = setTimeout(finish, FLY_MS);
        },
        [count, reducedMotion]
    );

    const goBack = useCallback(() => {
        if (count < 2 || busyRef.current) return;
        busyRef.current = true;
        setOrder((prev) => [prev[prev.length - 1], ...prev.slice(0, -1)]);
        timerRef.current = setTimeout(
            () => {
                busyRef.current = false;
            },
            reducedMotion ? 0 : SETTLE_MS * 0.6
        );
    }, [count, reducedMotion]);

    const onPointerDown = (e) => {
        if (count < 2 || busyRef.current) {
            gestureRef.current = { startX: e.clientX, startY: e.clientY, moved: false, swipe: false };
            return;
        }
        gestureRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startT: performance.now(),
            moved: false,
            swipe: true,
        };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {
            /* browser lama: lanjut tanpa capture */
        }
        setDrag({ x: 0, active: true });
    };

    const onPointerMove = (e) => {
        const g = gestureRef.current;
        if (!g || !g.swipe) return;
        const dx = e.clientX - g.startX;
        if (Math.abs(dx) > TAP_SLOP) g.moved = true;
        setDrag({ x: dx, active: true });
    };

    const endGesture = (e, cancelled = false) => {
        const g = gestureRef.current;
        gestureRef.current = null;
        if (!g) return;

        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        const isTap = Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP;

        if (!g.swipe) {
            if (!cancelled && isTap) onOpen?.({ url: images[topIndex].url, title: images[topIndex].description });
            return;
        }

        const dt = Math.max(performance.now() - g.startT, 1);
        const fast = Math.abs(dx) / dt > SWIPE_VELOCITY && Math.abs(dx) > 30;

        if (!cancelled && (Math.abs(dx) > SWIPE_DISTANCE || fast)) {
            advance(dx > 0 ? 1 : -1);
            return;
        }
        setDrag({ x: 0, active: false });
        if (!cancelled && isTap) onOpen?.({ url: images[topIndex].url, title: images[topIndex].description });
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            advance(-1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goBack();
        } else if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            onOpen?.({ url: images[topIndex].url, title: images[topIndex].description });
        }
    };

    const dragProgress = Math.min(Math.abs(drag.x) / SWIPE_DISTANCE, 1);
    const isStack = count > 1;

    return (
        <div className="mt-3">
            {isStack && (
                <div className="mb-3 flex justify-center">
                    <span
                        aria-live="polite"
                        className="rounded-full bg-vw-blue/10 px-3 py-1 text-xs font-bold tabular-nums text-vw-blue"
                    >
                        Photo {position}/{count}
                    </span>
                </div>
            )}

            {/* Tumpukan kartu. mb-9 memberi ruang untuk kartu belakang yang menyembul ke bawah. */}
            <div
                role="group"
                aria-roledescription="carousel"
                aria-label="Repair photos"
                tabIndex={0}
                onKeyDown={onKeyDown}
                className={`relative mx-auto aspect-[4/3] w-full max-w-md select-none rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vw-blue focus-visible:ring-offset-4 ${
                    isStack ? 'mb-14' : ''
                }`}
            >
                {images.map((image, idx) => {
                    const p = order.indexOf(idx);
                    const isTop = p === 0;
                    const base = restingTransform(p, isTop ? 0 : dragProgress);

                    let x = 0;
                    let rot = base.rot;
                    let opacity = p > MAX_VISIBLE_BEHIND ? 0 : 1;
                    if (isTop) {
                        if (flying) {
                            x = flying.dir * 420;
                            rot = flying.dir * 16;
                        } else {
                            x = drag.x;
                            rot = drag.x / 16;
                        }
                    }

                    const transition =
                        reducedMotion || (isTop && drag.active && !flying)
                            ? 'none'
                            : `transform ${isTop && flying ? FLY_MS : SETTLE_MS}ms ${EASE}, opacity 300ms ease`;

                    return (
                        <div
                            key={image.id}
                            aria-hidden={!isTop}
                            role={isTop ? 'button' : undefined}
                            tabIndex={-1}
                            aria-label={isTop ? `Photo ${idx + 1} of ${count}: ${image.description}. Tap to enlarge.` : undefined}
                            onPointerDown={isTop ? onPointerDown : undefined}
                            onPointerMove={isTop ? onPointerMove : undefined}
                            onPointerUp={isTop ? (e) => endGesture(e) : undefined}
                            onPointerCancel={isTop ? (e) => endGesture(e, true) : undefined}
                            className={`absolute inset-0 overflow-hidden rounded-3xl bg-white shadow-[0_14px_36px_-14px_rgba(22,27,89,0.38)] ring-1 ring-black/[0.06] will-change-transform ${
                                isTop ? 'cursor-grab touch-pan-y active:cursor-grabbing' : 'pointer-events-none'
                            }`}
                            style={{
                                zIndex: count - p,
                                transform: `translate3d(${x}px, ${base.y}px, 0) rotate(${rot}deg) scale(${base.scale})`,
                                transformOrigin: '50% 100%',
                                opacity,
                                transition,
                            }}
                        >
                            <img
                                src={image.url}
                                alt={isTop ? image.description : ''}
                                loading={idx === 0 ? 'eager' : 'lazy'}
                                decoding="async"
                                draggable={false}
                                className="h-full w-full object-cover [-webkit-user-drag:none]"
                            />
                            {/* Kartu di belakang sedikit digelapkan supaya terasa lebih dalam. */}
                            {!isTop && (
                                <span
                                    aria-hidden="true"
                                    className="absolute inset-0 bg-black"
                                    style={{ opacity: Math.min(p, MAX_VISIBLE_BEHIND) * 0.07 }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {isStack ? (
                <div className="mx-auto mt-2 flex max-w-md items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={goBack}
                        aria-label="Previous photo"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-vw-blue ring-1 ring-black/[0.08] transition active:bg-vw-grey-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vw-blue"
                    >
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 space-y-1 text-center text-xs text-vw-grey">
                        <p className="flex items-center justify-center gap-1.5">
                            <MoveHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Swipe to see the next photo
                        </p>
                        <p className="flex items-center justify-center gap-1.5">
                            <ZoomIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Tap a photo to enlarge
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => advance(-1)}
                        aria-label="Next photo"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-vw-blue ring-1 ring-black/[0.08] transition active:bg-vw-grey-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vw-blue"
                    >
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            ) : (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-vw-grey">
                    <ZoomIn className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Tap the photo to enlarge
                </p>
            )}

            {/* Deskripsi: semua ditumpuk di satu sel grid, hanya milik foto teratas yang tampak,
                sehingga tinggi area ini = deskripsi terpanjang dan halaman tidak melompat. */}
            <div className="mx-auto mt-4 grid max-w-md">
                {images.map((image, idx) => {
                    const active = idx === topIndex;
                    return (
                        <p
                            key={image.id}
                            aria-hidden={!active}
                            className={`col-start-1 row-start-1 whitespace-pre-line break-words text-center text-sm leading-snug text-gray-900 transition-opacity duration-300 motion-reduce:transition-none ${
                                active ? 'opacity-100' : 'invisible opacity-0'
                            }`}
                        >
                            {image.description}
                        </p>
                    );
                })}
            </div>
        </div>
    );
}
