// Dua ilustrasi halaman feedback: mobil hatchback generik (bukan model VW) + balon bicara.
// Warna hanya dari token project lewat kelas Tailwind (tanpa hex), satu aksen amber per gambar.
// Dekoratif: aria-hidden, nama halaman selalu tertulis sebagai teks.

function Car() {
    return (
        <>
            <path d="M20 122H220" className="stroke-white/25" strokeWidth="2" strokeLinecap="round" />
            <path
                d="M42 118C42 110 47 105 55 105H84L102 85H144L162 105H182C190 105 195 111 195 118V122H42V118Z"
                className="fill-white/90"
            />
            <path d="M88 102L103 88H122V102H88Z" className="fill-vw-blue/25" />
            <path d="M126 88H142L156 102H126V88Z" className="fill-vw-blue/25" />
            <circle cx="72" cy="120" r="14" className="fill-vw-blue" />
            <circle cx="72" cy="120" r="6" className="fill-white" />
            <circle cx="165" cy="120" r="14" className="fill-vw-blue" />
            <circle cx="165" cy="120" r="6" className="fill-white" />
        </>
    );
}

function Bubble() {
    return (
        <path
            d="M115 20H185C193.8 20 201 27.2 201 36V62C201 70.8 193.8 78 185 78H155L138 90V78H115C106.2 78 99 70.8 99 62V36C99 27.2 106.2 20 115 20Z"
            className="fill-white"
        />
    );
}

export function FeedbackIllustration({ className = 'h-36 w-56' }) {
    return (
        <svg viewBox="0 0 240 140" className={className} fill="none" aria-hidden="true" focusable="false">
            <Car />
            <Bubble />
            <path
                d="M150 35L153.2 43.5H162.2L154.9 48.8L157.7 57.2L150 51.8L142.3 57.2L145.1 48.8L137.8 43.5H146.8L150 35Z"
                className="fill-amber-500"
            />
            <rect x="74" y="38" width="22" height="30" rx="3" className="fill-white/60" />
            <rect x="79" y="34" width="12" height="6" rx="2" className="fill-white" />
            <line x1="79" y1="46" x2="91" y2="46" className="stroke-vw-blue" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="79" y1="52" x2="88" y2="52" className="stroke-vw-blue" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="79" y1="58" x2="90" y2="58" className="stroke-vw-blue" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

export function ThankYouIllustration({ className = 'h-36 w-56' }) {
    return (
        <svg viewBox="0 0 240 140" className={className} fill="none" aria-hidden="true" focusable="false">
            <Car />
            <Bubble />
            <path
                d="M150 54L148.5 52.6C143.4 48 140 44.9 140 41C140 37.8 142.4 35.4 145.5 35.4C147.3 35.4 149 36.2 150 37.5C151 36.2 152.7 35.4 154.5 35.4C157.6 35.4 160 37.8 160 41C160 44.9 156.6 48 151.5 52.6L150 54Z"
                className="fill-vw-blue"
            />
            <circle cx="95" cy="30" r="3" className="fill-white" />
            <circle cx="208" cy="28" r="3.5" className="fill-amber-500" />
            <circle cx="214" cy="46" r="2.5" className="fill-white/70" />
        </svg>
    );
}
