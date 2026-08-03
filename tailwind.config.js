const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],
    theme: {
        extend: {
            fontFamily: {
                // Font VW resmi (VW Head / VW Text) belum tersedia — akses Frontify
                // masih perlu request lisensi (lihat PROJECT-RULES.md bagian 11).
                // Sesuai Panduan Gaya Desain Web: "Opsi cadangan dalam kode hanya
                // boleh berupa 'sans serif' dan 'monospace'." — TIDAK BOLEH pakai
                // font pihak ketiga (Inter, Google Fonts, dsb) sebagai pengganti,
                // walau sementara. Jangan tambah font lain di sini sampai lisensi
                // resmi didapat dan aset font asli di-drop ke /resources/fonts.
                sans: [...defaultTheme.fontFamily.sans],
            },
            colors: {
                // --- token VW yang sudah ada, JANGAN dihapus ---
                // TODO verifikasi: hex di bawah ini belum dicocokkan ke kode warna
                // resmi VW Brand Portal/Frontify (dokumen yang jadi acuan project
                // ini belum mencantumkan kode hex resmi). Jangan anggap final
                // sebelum dicek langsung ke Frontify / Brand Portal.
                'vw-blue': '#001E50',
                'vw-light-blue': '#00B0F0',
                'vw-grey': '#767676',
                'vw-grey-light': '#F2F2F2',

                // Catatan brand: merah/hijau di bawah ini TIDAK ADA di palet resmi
                // VW (primer: VW Dark Blue + putih; sekunder: New Horizon 20).
                // Dipertahankan HANYA untuk status badge admin internal (urgent,
                // approved) — bukan untuk tombol approve/reject di halaman publik
                // customer (InspectionReport.jsx). Tombol customer-facing WAJIB
                // pakai vw-blue/putih sesuai aturan CTA resmi. Lihat keputusan di
                // PROJECT-RULES.md bagian 11.
                urgent: '#D32F2F',
                approved: '#2E7D32',

                // --- token generik untuk komponen shadcn, dipetakan ke CSS var ---
                border: 'hsl(var(--border))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                muted: {
                    foreground: 'hsl(var(--muted-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                sidebar: {
                    DEFAULT: 'hsl(var(--sidebar-background))',
                    foreground: 'hsl(var(--sidebar-foreground))',
                    border: 'hsl(var(--sidebar-border))',
                    accent: 'hsl(var(--sidebar-accent))',
                    'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
                    primary: 'hsl(var(--sidebar-primary))',
                    'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};