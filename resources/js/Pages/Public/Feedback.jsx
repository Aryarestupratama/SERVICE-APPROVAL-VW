import PublicLayout from '@/Layouts/PublicLayout';
import { Head, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Asterisk, Check, CircleAlert, Link2Off, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/Components/ui/avatar';
import { Textarea } from '@/Components/ui/textarea';
import { FeedbackIllustration, ThankYouIllustration } from '@/Components/Feedback/Illustrations';

// Halaman publik feedback FUAS (SCR-018). Seluruh teks berbahasa Indonesia (pengecualian RULE-010).
// Warna hanya dari token project (vw-blue, vw-grey, vw-grey-light, approved, urgent, amber).

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REQUIRED_FIELDS = ['satisfaction_score', 'recommend_score', 'vehicle_issue_note'];
const FIELD_ORDER = [...REQUIRED_FIELDS, 'suggestion', 'suggestion_categories'];
const NOTE_MAX = 2000;

// Label rentang skor hanya tampilan, tidak disimpan (FR-033). Dua angka per label.
const SATISFACTION = {
    start: 'Sangat Tidak Puas',
    end: 'Sangat Puas',
    labels: ['Sangat Tidak Puas', 'Tidak Puas', 'Cukup Puas', 'Puas', 'Sangat Puas'],
};
const RECOMMEND = {
    start: 'Tidak Merekomendasikan',
    end: 'Sangat Merekomendasikan',
    labels: ['Tidak Merekomendasikan', 'Kurang Merekomendasikan', 'Mungkin Merekomendasikan', 'Merekomendasikan', 'Sangat Merekomendasikan'],
};
const scoreLabel = (scale, n) => scale.labels[Math.ceil(n / 2) - 1];

// Pesan per status HTTP untuk abort() dan jaringan (RULE-041, RULE-042).
const ERROR_MESSAGES = {
    409: 'Feedback ini sudah terkirim sebelumnya.',
    410: 'Link feedback ini sudah ditutup.',
    413: 'Data terlalu besar. Persingkat isian Anda lalu coba lagi.',
    419: 'Sesi Anda berakhir. Muat ulang halaman lalu coba lagi.',
    422: 'Data tidak dapat diproses. Periksa isian Anda lalu coba lagi.',
    429: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
    network: 'Tidak ada koneksi. Periksa sinyal Anda lalu coba lagi.',
};

const initials = (name) =>
    String(name ?? 'VW')
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Ilustrasi hero (TASK-037): gambar JPG di public/images/feedback/ (latar putih polos) dipasang di
// panel putih di atas hero navy, sehingga tidak ada kotak putih yang menyala di atas latar gelap.
// Rasio 16:9 dipesan lewat aspect-video agar tata letak tidak bergeser saat gambar dimuat.
// Bila file belum ada / gagal dimuat, kembali ke SVG lama (dekoratif).
function HeroIllustration({ src, Fallback }) {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return (
            <div className="mt-4 flex h-36 items-center justify-center">
                <Fallback />
            </div>
        );
    }

    return (
        <div className="mx-auto mt-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-sm">
            <img
                src={src}
                alt=""
                width={1600}
                height={900}
                decoding="async"
                fetchPriority="high"
                onError={() => setFailed(true)}
                className="aspect-video w-full object-contain"
            />
        </div>
    );
}

function Hero({ workshopName, children }) {
    return (
        <header className="rounded-b-[32px] bg-gradient-to-b from-vw-blue to-vw-blue/85 px-5 pb-14 pt-5 text-white">
            <div className="mx-auto max-w-xl">
                <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 shrink-0 rounded-xl bg-white">
                        <AvatarImage src="/images/vw-logo-navy.jpeg" alt="" className="object-contain p-0.5" />
                        <AvatarFallback className="rounded-xl bg-white text-xs font-bold text-vw-blue">
                            {initials(workshopName)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight text-white">{workshopName}</p>
                        <p className="text-xs text-white/80">Feedback Service</p>
                    </div>
                </div>
                {children}
            </div>
        </header>
    );
}

function FieldError({ id, children }) {
    return (
        <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-urgent">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

// Status selalu berupa ikon + kata, bukan hanya warna.
function StatusChip({ kind }) {
    const config = {
        required: { label: 'Wajib', Icon: Asterisk, cls: 'bg-vw-blue/10 text-vw-blue' },
        done: { label: 'Terjawab', Icon: Check, cls: 'bg-approved/10 text-approved' },
        error: { label: 'Belum diisi', Icon: CircleAlert, cls: 'bg-white text-urgent ring-1 ring-inset ring-urgent/40' },
        optional: { label: 'Opsional', Icon: null, cls: 'bg-vw-grey-light text-gray-600' },
    }[kind];
    const { label, Icon, cls } = config;

    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
            {Icon && <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
            {label}
        </span>
    );
}

function QuestionCard({ id, number, chip, titleId, htmlFor, title, hint, invalid, children }) {
    const Title = htmlFor ? 'label' : 'p';

    return (
        <section
            id={`card-${id}`}
            className={`scroll-mt-4 rounded-3xl border bg-white p-5 shadow-sm ${invalid ? 'border-urgent/50' : 'border-border'}`}
        >
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-vw-grey">Pertanyaan {number} dari 5</p>
                <StatusChip kind={chip} />
            </div>
            <Title id={titleId} htmlFor={htmlFor} className="mt-2 block text-base font-semibold leading-snug text-gray-900">
                {title}
            </Title>
            {hint && <p className="mt-0.5 text-sm text-gray-600">{hint}</p>}
            <div className="mt-3">{children}</div>
        </section>
    );
}

// Pemilih skor 1-10 sebagai radio group asli: panah keyboard, fokus, dan pembaca layar bekerja bawaan.
function ScoreSelector({ name, titleId, value, onChange, error, scale, disabled }) {
    const errorId = `${name}-error`;

    return (
        <div role="radiogroup" aria-labelledby={titleId} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
            <div className="grid grid-cols-5 gap-2">
                {SCORES.map((n) => {
                    const checked = value === n;

                    return (
                        <label key={n} className="relative block cursor-pointer">
                            <input
                                type="radio"
                                name={name}
                                value={n}
                                checked={checked}
                                disabled={disabled}
                                onChange={() => onChange(n)}
                                className="peer sr-only"
                                aria-label={`${n}, ${scoreLabel(scale, n)}`}
                            />
                            <span
                                aria-hidden="true"
                                className={`relative flex h-[52px] items-center justify-center rounded-xl border text-base font-semibold tabular-nums transition peer-focus-visible:ring-2 peer-focus-visible:ring-vw-blue peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 ${
                                    checked
                                        ? 'border-vw-blue bg-vw-blue text-white ring-2 ring-vw-blue ring-offset-2'
                                        : 'border-border bg-white text-gray-900 active:bg-vw-grey-light'
                                }`}
                            >
                                {n}
                                {checked && (
                                    <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-vw-blue">
                                        <Check className="h-2.5 w-2.5" strokeWidth={4} />
                                    </span>
                                )}
                            </span>
                        </label>
                    );
                })}
            </div>
            <div className="mt-2 flex justify-between gap-3 text-xs text-vw-grey">
                <span>1 · {scale.start}</span>
                <span className="text-right">10 · {scale.end}</span>
            </div>
            <p aria-live="polite" className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-vw-blue">
                <span className="h-2 w-2 rounded-full bg-vw-blue" aria-hidden="true" />
                {value ? `${value} · ${scoreLabel(scale, value)}` : 'Ketuk angka untuk memilih'}
            </p>
            {error && <FieldError id={errorId}>{error}</FieldError>}
        </div>
    );
}

function CategoryRow({ id, label, checked, onChange, disabled }) {
    return (
        <label
            htmlFor={id}
            className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-xl bg-vw-grey-light/70 px-4 py-2 active:bg-vw-grey-light"
        >
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
            <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-vw-blue peer-focus-visible:ring-offset-2 ${
                    checked ? 'border-vw-blue bg-vw-blue text-white' : 'border-vw-grey/50 bg-white'
                }`}
            >
                {checked && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
        </label>
    );
}

function FeedbackForm({ token, customer, vehicle, categories, settings }) {
    const form = useForm({
        satisfaction_score: null,
        recommend_score: null,
        vehicle_issue_note: '',
        suggestion: '',
        suggestion_categories: [],
    });
    const [clientErrors, setClientErrors] = useState({});
    const errors = { ...form.errors, ...clientErrors };

    // RULE-041, RULE-042: penolakan server dan kegagalan jaringan selalu terlihat.
    useEffect(() => {
        const offInvalid = router.on('invalid', (event) => {
            const status = event.detail.response?.status;
            if (!ERROR_MESSAGES[status]) return;
            event.preventDefault();
            toast.error(ERROR_MESSAGES[status]);
            // Sudah terkirim / sudah ditutup: muat ulang supaya halaman menampilkan state yang benar.
            if (status === 409 || status === 410) router.reload();
        });
        const offException = router.on('exception', (event) => {
            event.preventDefault();
            toast.error(ERROR_MESSAGES.network);
        });

        return () => {
            offInvalid();
            offException();
        };
    }, []);

    const noteFilled = form.data.vehicle_issue_note.trim() !== '';
    const answered =
        Number(form.data.satisfaction_score !== null) + Number(form.data.recommend_score !== null) + Number(noteFilled);
    const hasErrors = REQUIRED_FIELDS.some((field) => errors[field]);

    const setField = (field, value) => {
        form.setData(field, value);
        if (form.errors[field]) form.clearErrors(field);
        if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
    };

    const focusFirstError = (found) => {
        const first = FIELD_ORDER.find((field) => found[field]);
        if (!first) return;

        requestAnimationFrame(() => {
            const card = document.getElementById(`card-${first}`);
            card?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            card?.querySelector('input, textarea')?.focus({ preventScroll: true });
        });
    };

    const submit = (event) => {
        event.preventDefault();
        if (form.processing) return;

        const problems = {};
        if (form.data.satisfaction_score === null) problems.satisfaction_score = 'Pilih angka 1 sampai 10.';
        if (form.data.recommend_score === null) problems.recommend_score = 'Pilih angka 1 sampai 10.';
        if (!noteFilled) problems.vehicle_issue_note = 'Wajib diisi. Tulis "Tidak ada" jika tidak ada kendala.';

        setClientErrors(problems);
        if (Object.keys(problems).length > 0) {
            focusFirstError(problems);
            return;
        }

        form.post(route('public.feedback.submit', token), {
            preserveScroll: true,
            onError: (serverErrors) => focusFirstError(serverErrors),
        });
    };

    const toggleCategory = (value) => {
        const current = form.data.suggestion_categories;
        setField('suggestion_categories', current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    };

    const chipFor = (field, done) => (errors[field] ? 'error' : done ? 'done' : 'required');
    const vehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plate_number})` : '—';

    return (
        <PublicLayout footerText={null}>
            <Head>
                <title>Feedback Service</title>
                <meta name="robots" content="noindex" />
            </Head>

            <form onSubmit={submit} noValidate className="min-h-dvh bg-white pb-32">
                <Hero workshopName={settings.workshop_name}>
                    <HeroIllustration src="/images/feedback/feedback.jpg" Fallback={FeedbackIllustration} />
                </Hero>

                <div className="mx-auto -mt-8 max-w-xl px-4">
                    <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-vw-grey">Setelah service</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-vw-blue/10 px-2.5 py-1 text-xs font-semibold text-vw-blue">
                                <Asterisk className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                                3 pertanyaan wajib
                            </span>
                        </div>
                        <h1 className="mt-2 text-[22px] font-bold leading-snug text-vw-blue">Bagaimana pengalaman Anda?</h1>
                        <p className="mt-1 text-sm leading-relaxed text-gray-600">
                            Terima kasih telah mempercayakan perawatan kendaraan Anda kepada VW PIK. Mengisi formulir ini hanya butuh sekitar 1 menit.
                        </p>
                        <div
                            className="mt-4 grid grid-cols-3 gap-1.5"
                            role="progressbar"
                            aria-label="Pertanyaan wajib yang sudah terisi"
                            aria-valuemin={0}
                            aria-valuemax={3}
                            aria-valuenow={answered}
                        >
                            {[0, 1, 2].map((index) => (
                                <div key={index} className={`h-1.5 rounded-full ${index < answered ? 'bg-vw-blue' : 'bg-vw-blue/15'}`} />
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-vw-grey">{answered} dari 3 pertanyaan wajib terisi</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="min-w-0 rounded-xl bg-vw-grey-light/70 px-4 py-3">
                            <p className="text-xs text-gray-600">Customer</p>
                            <p className="mt-0.5 break-words text-sm font-bold text-gray-900">{customer?.name ?? '—'}</p>
                        </div>
                        <div className="min-w-0 rounded-xl bg-vw-grey-light/70 px-4 py-3">
                            <p className="text-xs text-gray-600">Kendaraan</p>
                            <p className="mt-0.5 break-words text-sm font-bold text-gray-900">{vehicleLabel}</p>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-4">
                        <QuestionCard
                            id="satisfaction_score"
                            number={1}
                            chip={chipFor('satisfaction_score', form.data.satisfaction_score !== null)}
                            titleId="q1-title"
                            title="Seberapa puas Anda dengan pengerjaan service dan pelayanan kami?"
                            invalid={Boolean(errors.satisfaction_score)}
                        >
                            <ScoreSelector
                                name="satisfaction_score"
                                titleId="q1-title"
                                value={form.data.satisfaction_score}
                                onChange={(n) => setField('satisfaction_score', n)}
                                error={errors.satisfaction_score}
                                scale={SATISFACTION}
                                disabled={form.processing}
                            />
                        </QuestionCard>

                        <QuestionCard
                            id="recommend_score"
                            number={2}
                            chip={chipFor('recommend_score', form.data.recommend_score !== null)}
                            titleId="q2-title"
                            title="Seberapa besar kemungkinan Anda merekomendasikan dealer kami kepada teman atau kolega?"
                            invalid={Boolean(errors.recommend_score)}
                        >
                            <ScoreSelector
                                name="recommend_score"
                                titleId="q2-title"
                                value={form.data.recommend_score}
                                onChange={(n) => setField('recommend_score', n)}
                                error={errors.recommend_score}
                                scale={RECOMMEND}
                                disabled={form.processing}
                            />
                        </QuestionCard>

                        <QuestionCard
                            id="vehicle_issue_note"
                            number={3}
                            chip={chipFor('vehicle_issue_note', noteFilled)}
                            titleId="q3-title"
                            htmlFor="vehicle_issue_note"
                            title="Apakah mobil Anda setelah dari bengkel ada kendala?"
                            invalid={Boolean(errors.vehicle_issue_note)}
                        >
                            <Textarea
                                id="vehicle_issue_note"
                                rows={4}
                                maxLength={NOTE_MAX}
                                value={form.data.vehicle_issue_note}
                                onChange={(e) => setField('vehicle_issue_note', e.target.value)}
                                disabled={form.processing}
                                placeholder='Tulis di sini. Jika tidak ada kendala, tulis "Tidak ada".'
                                aria-invalid={errors.vehicle_issue_note ? true : undefined}
                                aria-describedby={errors.vehicle_issue_note ? 'vehicle_issue_note-error' : undefined}
                                className={`min-h-[112px] rounded-xl bg-vw-grey-light/70 ${errors.vehicle_issue_note ? 'border-2 border-urgent' : ''}`}
                            />
                            {errors.vehicle_issue_note && <FieldError id="vehicle_issue_note-error">{errors.vehicle_issue_note}</FieldError>}
                        </QuestionCard>

                        <QuestionCard
                            id="suggestion"
                            number={4}
                            chip="optional"
                            titleId="q4-title"
                            htmlFor="suggestion"
                            title="Saran dan masukan dari Anda"
                            invalid={Boolean(errors.suggestion)}
                        >
                            <Textarea
                                id="suggestion"
                                rows={4}
                                maxLength={NOTE_MAX}
                                value={form.data.suggestion}
                                onChange={(e) => setField('suggestion', e.target.value)}
                                disabled={form.processing}
                                placeholder="Ceritakan pengalaman atau saran Anda."
                                aria-invalid={errors.suggestion ? true : undefined}
                                aria-describedby={errors.suggestion ? 'suggestion-error' : undefined}
                                className={`min-h-[112px] rounded-xl bg-vw-grey-light/70 ${errors.suggestion ? 'border-2 border-urgent' : ''}`}
                            />
                            {errors.suggestion && <FieldError id="suggestion-error">{errors.suggestion}</FieldError>}
                        </QuestionCard>

                        <QuestionCard
                            id="suggestion_categories"
                            number={5}
                            chip="optional"
                            titleId="q5-title"
                            title="Kategori saran dan masukan"
                            hint="Pilih yang sesuai dengan masukan Anda."
                            invalid={Boolean(errors.suggestion_categories)}
                        >
                            <div role="group" aria-labelledby="q5-title" className="flex flex-col gap-2">
                                {categories.map((category) => (
                                    <CategoryRow
                                        key={category.value}
                                        id={`category-${category.value}`}
                                        label={category.label}
                                        checked={form.data.suggestion_categories.includes(category.value)}
                                        onChange={() => toggleCategory(category.value)}
                                        disabled={form.processing}
                                    />
                                ))}
                            </div>
                            {errors.suggestion_categories && <FieldError id="suggestion_categories-error">{errors.suggestion_categories}</FieldError>}
                        </QuestionCard>
                    </div>
                </div>

                <div
                    className="fixed inset-x-0 bottom-0 z-40 border-t border-vw-grey/15 bg-white/95 backdrop-blur"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900">{answered} dari 3 wajib terisi</p>
                            <p className={`text-xs ${hasErrors ? 'font-medium text-urgent' : 'text-vw-grey'}`}>
                                {hasErrors ? 'Lengkapi pertanyaan wajib di atas.' : 'Pertanyaan 4 dan 5 boleh dilewati.'}
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={form.processing}
                            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full bg-vw-blue px-6 text-sm font-semibold text-white shadow-md shadow-vw-blue/25 transition hover:bg-vw-blue/90 disabled:opacity-70"
                        >
                            {form.processing ? (
                                <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                            ) : (
                                <Send className="h-4 w-4" aria-hidden="true" />
                            )}
                            {form.processing ? 'Mengirim...' : 'Kirim feedback'}
                        </button>
                    </div>
                </div>
            </form>
        </PublicLayout>
    );
}

function ThankYou({ settings }) {
    return (
        <PublicLayout footerText={null}>
            <Head>
                <title>Terima kasih</title>
                <meta name="robots" content="noindex" />
            </Head>
            <div className="min-h-dvh bg-white pb-12">
                <Hero workshopName={settings.workshop_name}>
                    <HeroIllustration src="/images/feedback/thank-you.jpg" Fallback={ThankYouIllustration} />
                </Hero>
                <div className="mx-auto -mt-8 max-w-xl px-4">
                    <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-approved/10 px-3 py-1 text-xs font-semibold text-approved">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                            Feedback terkirim
                        </span>
                        <h1 className="mt-3 text-[22px] font-bold leading-snug text-vw-blue">Terima kasih atas feedback Anda</h1>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                            Masukan Anda sudah kami terima dan sangat berarti bagi kami untuk meningkatkan layanan VW PIK.
                        </p>
                        <p className="mt-4 rounded-xl bg-vw-grey-light/70 px-4 py-3 text-xs text-gray-600">
                            Formulir ini sudah terisi dan tidak dapat diubah lagi.
                        </p>
                    </div>
                </div>
            </div>
        </PublicLayout>
    );
}

function LinkClosed() {
    return (
        <PublicLayout footerText={null}>
            <Head>
                <title>Link feedback ditutup</title>
                <meta name="robots" content="noindex" />
            </Head>
            <div className="flex min-h-dvh items-center justify-center px-6">
                <div className="w-full max-w-[340px] text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-vw-blue/10 text-vw-blue ring-8 ring-vw-blue/5">
                        <Link2Off className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h1 className="mt-5 text-[22px] font-bold leading-snug text-vw-blue">Link feedback ini sudah ditutup</h1>
                    <p className="mt-3 text-sm leading-relaxed text-gray-600">
                        Terima kasih. Batas waktu pengisian feedback untuk kunjungan ini sudah berakhir, sehingga formulir tidak dapat diisi lagi.
                    </p>
                </div>
            </div>
        </PublicLayout>
    );
}

export default function Feedback({ state, settings, token, customer, vehicle, categories = [] }) {
    if (state === 'submitted') return <ThankYou settings={settings} />;
    if (state === 'closed') return <LinkClosed />;

    return <FeedbackForm token={token} customer={customer} vehicle={vehicle} categories={categories} settings={settings} />;
}
