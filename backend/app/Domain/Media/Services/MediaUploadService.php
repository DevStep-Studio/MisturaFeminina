<?php

declare(strict_types=1);

namespace App\Domain\Media\Services;

use App\Models\MediaAsset;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MediaUploadService
{
    /** @var array<string, list<string>> */
    private const ALLOWED_MIMES = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/avif' => ['avif'],
        'image/x-icon' => ['ico'],
        'image/vnd.microsoft.icon' => ['ico'],
    ];

    public function uploadImage(UploadedFile $file, ?User $actor = null, ?string $title = null, ?string $altText = null, string $folder = 'uploads'): MediaAsset
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages(['file' => ['Arquivo de upload inválido.']]);
        }

        $maxBytes = 5 * 1024 * 1024;
        if (($file->getSize() ?: 0) > $maxBytes) {
            throw ValidationException::withMessages(['file' => ['O arquivo excede o tamanho máximo de 5 MB.']]);
        }

        $realPath = $file->getRealPath();
        if ($realPath === false) {
            throw ValidationException::withMessages(['file' => ['Não foi possível ler o arquivo enviado.']]);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = (string) $finfo->file($realPath);

        if (! array_key_exists($detectedMime, self::ALLOWED_MIMES)) {
            throw ValidationException::withMessages(['file' => ["Tipo de imagem não permitido ({$detectedMime}). Utilize JPG, PNG, WebP, AVIF ou ICO."]]);
        }

        $ext = self::ALLOWED_MIMES[$detectedMime][0];
        $width = null;
        $height = null;

        if ($ext !== 'ico') {
            $imageInfo = @getimagesize($realPath);
            if ($imageInfo === false) {
                throw ValidationException::withMessages(['file' => ['O arquivo enviado não é uma imagem válida.']]);
            }
            $width = (int) $imageInfo[0];
            $height = (int) $imageInfo[1];
        }

        $subDir = trim($folder, '/').'/'.now()->format('Y/m');
        $filename = Str::uuid()->toString().'.'.$ext;
        $storedPath = $file->storeAs($subDir, $filename, 'public');
        if ($storedPath === false) {
            throw ValidationException::withMessages(['file' => ['Falha ao gravar arquivo no storage.']]);
        }

        return MediaAsset::query()->create([
            'uploaded_by' => $actor?->id,
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'disk' => 'public',
            'path' => '/storage/'.$storedPath,
            'mime_type' => $detectedMime,
            'size_bytes' => (int) ($file->getSize() ?: 0),
            'width' => $width,
            'height' => $height,
            'alt_text' => $altText ?: $title,
            'focal_point' => 'center',
        ]);
    }

    public static function storageUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://') || str_starts_with($path, '/')) {
            return $path;
        }

        return Storage::disk('public')->url($path);
    }
}
