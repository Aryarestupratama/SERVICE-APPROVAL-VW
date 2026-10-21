# Service Inspection Report - VW PIK

Sistem internal untuk satu bengkel (Volkswagen PIK). Service Advisor (SA) membuat Service Order dan mengirim link laporan lewat WhatsApp. Customer membuka link tanpa login, menonton video teknisi, menyetujui atau menolak biaya per item, lalu mengikuti progres sampai kendaraan diambil. Setelah order selesai, admin menjalankan follow up after service (FUAS) untuk mengumpulkan feedback customer.

## Stack

- Laravel 13, PHP 8.4 atau lebih baru (`composer.lock` memuat paket Symfony 8 yang mensyaratkan PHP >= 8.4.1)
- React 18 + Inertia 2, Vite 5, Tailwind CSS 3, komponen shadcn/ui
- Database: SQLite untuk lokal (default `.env.example`); production memakai MySQL
- Excel: `phpoffice/phpspreadsheet` (impor data dan ekspor feedback FUAS)

## Menjalankan di lokal

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan storage:link
npm install
npm run build
```

Untuk pengembangan, `composer run dev` menjalankan server, queue listener, log, dan Vite sekaligus.

### Data demo (hanya lokal)

```bash
php artisan migrate:fresh --seed
```

Seeder membuat akun awal dan data demo fiktif (customer, kendaraan, order). Ganti password akun awal sebelum dipakai di luar mesin lokal.

## Production

- `php artisan db:seed` tanpa `--class` ditolak di production. Seeder dasar dijalankan eksplisit dan hanya bila tabel masih kosong:
  `php artisan db:seed --class=SettingsSeeder --force` dan `php artisan db:seed --class=UserSeeder --force`.
- Seeder demo hanya untuk lokal atau staging.
- Jalankan `npm run build` sebelum rilis. Cadangkan database sebelum `php artisan migrate`.
- Periksa `upload_max_filesize` dan `post_max_size` hosting; unggahan video bergantung padanya.

## Pengujian

```bash
composer test
```

Saat ini `tests/` baru berisi tes bawaan Laravel Breeze; belum ada tes untuk logika proyek.
