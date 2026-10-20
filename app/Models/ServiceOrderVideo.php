<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ServiceOrderVideo extends Model
{
    protected $fillable = [
        'service_order_id',
        'video_url',
        'video_source', // upload, external_link
        'sort_order',
        'duration_seconds',
    ];

    public function serviceOrder()
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    /**
     * Path relatif di disk `public` dari sebuah `video_url` hasil upload.
     *
     * `video_url` disimpan sebagai URL ABSOLUT (Storage::url()), jadi bila
     * APP_URL atau skema berubah (mis. migrasi http -> https) mencocokkan
     * awalan URL lama gagal dan file tidak ikut terhapus. Di sini path
     * diambil dari bagian setelah `/storage/` pada path URL, tidak peduli
     * host dan skemanya. Mengembalikan null bila bukan URL storage.
     */
    public static function storagePathFromUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH);

        if (! is_string($path) || ! str_contains($path, '/storage/')) {
            return null;
        }

        $relative = ltrim(Str::after($path, '/storage/'), '/');

        if ($relative === '' || str_contains($relative, '..')) {
            return null;
        }

        return $relative;
    }

    /** Path file fisik video ini; null untuk video_source = external_link. */
    public function storagePath(): ?string
    {
        return $this->video_source === 'upload'
            ? self::storagePathFromUrl($this->video_url)
            : null;
    }
}