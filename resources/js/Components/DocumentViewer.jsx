import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Viewer dokumen layar penuh untuk halaman publik (estimation PDF, invoice, bukti bayar).
 *
 * Kenapa bukan <iframe>/<object>: Safari iOS cuma menampilkan halaman PERTAMA PDF di
 * dalam iframe dan susah di-scroll. Jadi PDF dirender per halaman ke <canvas> pakai
 * pdf.js (di-load lazy, hanya saat ada PDF yang dibuka). Foto cukup pakai <img>.
 *
 * Tombol "Back" dan gesture back (swipe dari tepi layar di iPhone / tombol back Android)
 * sama-sama menutup viewer, TIDAK keluar dari halaman report. Caranya lewat hash URL
 * (#doc-viewer) — dipilih karena Inertia sudah menangani popstate tanpa state dengan aman,
 * beda dengan history.pushState() manual yang bisa mengganggu state Inertia.
 */

const ZOOM_LEVELS = [1, 1.5, 2, 3];
const HASH_MARKER = '#doc-viewer';
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|heic)$/i;

function detectKind(url) {
    const path = String(url).split(/[?#]/)[0];
    return IMAGE_EXT.test(path) ? 'image' : 'pdf';
}

// pdf.js dimuat sekali lalu di-cache. Build "legacy" dipakai supaya jalan di iOS lama.
let pdfjsPromise = null;
function loadPdfjs() {
    if (!pdfjsPromise) {
        pdfjsPromise = Promise.all([
            import('pdfjs-dist/legacy/build/pdf.mjs'),
            import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ])
            .then(([lib, worker]) => {
                lib.GlobalWorkerOptions.workerSrc = worker.default;
                return lib;
            })
            .catch((err) => {
                pdfjsPromise = null; // boleh dicoba lagi kalau gagal (mis. koneksi putus)
                throw err;
            });
    }
    return pdfjsPromise;
}

function ViewerError({ url }) {
    return (
        <div className="mx-auto mt-16 max-w-xs px-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-gray-900">We couldn't display this file here.</p>
            <p className="mt-1 text-xs text-vw-grey">You can still open it in a separate tab.</p>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-vw-blue px-5 text-sm font-semibold text-white shadow-sm"
            >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open in new tab
            </a>
        </div>
    );
}

function LoadingState({ label }) {
    return (
        <div className="flex flex-col items-center gap-2 pt-20 text-vw-grey">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <p className="text-xs font-medium">{label}</p>
        </div>
    );
}

function ImagePreview({ url, title, zoom }) {
    const [state, setState] = useState('loading'); // loading | ready | error

    if (state === 'error') return <ViewerError url={url} />;

    return (
        <div className="p-2">
            {state === 'loading' && <LoadingState label="Loading image…" />}
            <img
                src={url}
                alt={title}
                onLoad={() => setState('ready')}
                onError={() => setState('error')}
                // max-w-none: override preflight (max-width:100%) supaya zoom > 100% bisa melebar;
                // lebar diatur lewat persen, container yang scroll.
                style={{ width: `${zoom * 100}%` }}
                className={`mx-auto block h-auto max-w-none rounded-md bg-white shadow-md ${state === 'loading' ? 'hidden' : ''}`}
            />
        </div>
    );
}

function PdfPages({ url, zoom }) {
    const wrapRef = useRef(null);
    const canvasRefs = useRef([]);
    const [pdf, setPdf] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | ready | error
    const [width, setWidth] = useState(0);

    // Lebar area tampilan; dipantau supaya render ulang saat layar diputar (portrait/landscape).
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const update = () => setWidth(el.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', update); // browser sangat lama
            return () => window.removeEventListener('resize', update);
        }
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Load dokumen.
    useEffect(() => {
        let cancelled = false;
        let task = null;
        setStatus('loading');
        setPdf(null);

        loadPdfjs()
            .then((lib) => {
                if (cancelled) return null;
                task = lib.getDocument({ url });
                return task.promise;
            })
            .then((doc) => {
                if (!doc) return;
                if (cancelled) {
                    doc.destroy();
                    return;
                }
                setPdf(doc);
                setStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
            });

        return () => {
            cancelled = true;
            if (task) task.destroy();
        };
    }, [url]);

    // Render semua halaman ke canvas. Dijalankan ulang kalau zoom / lebar layar berubah.
    useEffect(() => {
        if (!pdf || !width) return undefined;
        let cancelled = false;
        const tasks = [];

        (async () => {
            for (let n = 1; n <= pdf.numPages; n += 1) {
                if (cancelled) return;
                const page = await pdf.getPage(n);
                const canvas = canvasRefs.current[n - 1];
                if (cancelled || !canvas) return;

                const base = page.getViewport({ scale: 1 });
                const cssWidth = Math.max(1, (width - 16) * zoom); // 16px = padding kiri+kanan
                const viewport = page.getViewport({ scale: cssWidth / base.width });

                // Tajam di layar retina, tapi dibatasi: canvas terlalu besar bikin Safari iOS
                // kehabisan memori dan menghasilkan halaman kosong.
                let outputScale = Math.min(window.devicePixelRatio || 1, 3);
                while (outputScale > 1 && viewport.width * outputScale * viewport.height * outputScale > 12000000) {
                    outputScale -= 0.25;
                }

                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                canvas.style.width = `${Math.floor(viewport.width)}px`;
                canvas.style.height = `${Math.floor(viewport.height)}px`;

                const renderTask = page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport,
                    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
                });
                tasks.push(renderTask);

                try {
                    await renderTask.promise;
                } catch {
                    // dibatalkan (zoom berubah / viewer ditutup) — abaikan
                }
            }
        })();

        return () => {
            cancelled = true;
            tasks.forEach((t) => t.cancel());
        };
    }, [pdf, width, zoom]);

    return (
        <div ref={wrapRef} className="w-full p-2">
            {status === 'loading' && <LoadingState label="Loading document…" />}
            {status === 'error' && <ViewerError url={url} />}
            {status === 'ready' &&
                Array.from({ length: pdf.numPages }, (_, i) => (
                    <canvas
                        key={i}
                        ref={(el) => {
                            canvasRefs.current[i] = el;
                        }}
                        role="img"
                        aria-label={`Page ${i + 1} of ${pdf.numPages}`}
                        className="mx-auto mb-3 block rounded-md bg-white shadow-md"
                    />
                ))}
        </div>
    );
}

export default function DocumentViewer({ doc, onClose }) {
    const kind = detectKind(doc.url);
    const [zoomIndex, setZoomIndex] = useState(0);
    const zoom = ZOOM_LEVELS[zoomIndex];

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // Buka viewer = tambah 1 entri history (hash). Back/swipe-back = hash hilang = tutup viewer.
    useEffect(() => {
        if (window.location.hash !== HASH_MARKER) {
            window.location.hash = HASH_MARKER;
        }
        const handlePop = () => {
            if (window.location.hash !== HASH_MARKER) onCloseRef.current();
        };
        window.addEventListener('popstate', handlePop);
        return () => window.removeEventListener('popstate', handlePop);
    }, []);

    // Kunci scroll halaman di belakang selama viewer terbuka.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const handleBack = useCallback(() => {
        if (window.location.hash === HASH_MARKER) {
            window.history.back(); // memicu popstate → handlePop menutup viewer
        } else {
            onCloseRef.current();
        }
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') handleBack();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleBack]);

    const zoomButton =
        'inline-flex h-11 w-11 items-center justify-center rounded-lg text-vw-blue transition active:bg-vw-blue/10 disabled:opacity-30';

    return (
        <div role="dialog" aria-modal="true" aria-label={doc.title} className="fixed inset-0 z-[60] flex flex-col bg-neutral-200">
            <header
                className="flex shrink-0 items-center gap-1 border-b border-vw-grey/15 bg-white px-2 pb-2 shadow-sm"
                style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
            >
                <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg pl-2 pr-3 text-sm font-semibold text-vw-blue transition active:bg-vw-blue/10"
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                    Back
                </button>

                <p className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold text-gray-900">{doc.title}</p>

                <div className="flex shrink-0 items-center">
                    <button
                        type="button"
                        onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                        disabled={zoomIndex === 0}
                        className={zoomButton}
                        aria-label="Zoom out"
                    >
                        <ZoomOut className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                        disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                        className={zoomButton}
                        aria-label="Zoom in"
                    >
                        <ZoomIn className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={zoomButton}
                        aria-label="Open in a new tab"
                    >
                        <ExternalLink className="h-5 w-5" aria-hidden="true" />
                    </a>
                </div>
            </header>

            <div
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {kind === 'image' ? (
                    <ImagePreview url={doc.url} title={doc.title} zoom={zoom} />
                ) : (
                    <PdfPages url={doc.url} zoom={zoom} />
                )}
            </div>
        </div>
    );
}