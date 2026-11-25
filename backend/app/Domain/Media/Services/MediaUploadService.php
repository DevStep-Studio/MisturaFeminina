<?php

declare(strict_types=1);

namespace App\Domain\Media\Services;

use App\Domain\Shared\Services\SafeExternalHttpClient;
use App\Models\MediaAsset;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MediaUploadService
{
    public function __construct(
        private readonly SafeExternalHttpClient $externalHttp,
    ) {}

    /** @var array<string, list<string>> */
    private const ALLOWED_MIMES = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/avif' => ['avif'],
        'image/x-icon' => ['ico'],
        'image/vnd.microsoft.icon' => ['ico'],
    ];

    /** @var array<string, list<string>> */
    private const ALLOWED_CATALOG_IMAGE_MIMES = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/avif' => ['avif'],
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
        $uuid = Str::uuid()->toString();
        $filename = $uuid.'.'.$ext;
        $storedPath = $file->storeAs($subDir, $filename, 'public');
        if ($storedPath === false) {
            throw ValidationException::withMessages(['file' => ['Falha ao gravar arquivo no storage.']]);
        }

        if (in_array(trim($folder, '/'), ['catalog', 'products'], true) && $ext !== 'ico') {
            $this->generateCatalogThumb($realPath, $subDir, $uuid);
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

    /**
     * Validates, downloads via SSRF-safe HTTP client with redirect validation,
     * verifies actual image bytes/dimensions, creates catalog thumbnail, and saves locally.
     *
     * @return array{asset: MediaAsset, path: string, thumb_path: string|null, width: int, height: int, mime_type: string, size_bytes: int, source_url: string}
     */
    public function importFromExternalUrl(
        string $url,
        ?User $actor = null,
        ?string $title = null,
        ?string $altText = null,
        string $folder = 'catalog',
    ): array {
        $maxBytes = 5 * 1024 * 1024;
        $fetched = $this->externalHttp->fetch($url, $maxBytes, 14, [
            'Accept' => 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        ]);

        $tmpFile = tempnam(sys_get_temp_dir(), 'mf_img_');
        if ($tmpFile === false) {
            throw ValidationException::withMessages([
                'url' => ['Não foi possível alocar arquivo temporário para validar a imagem.'],
            ]);
        }

        try {
            file_put_contents($tmpFile, $fetched['body']);

            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detectedMime = (string) $finfo->file($tmpFile);
            if (! array_key_exists($detectedMime, self::ALLOWED_CATALOG_IMAGE_MIMES)) {
                throw ValidationException::withMessages([
                    'url' => ["O endereço não retornou uma imagem válida no formato JPG, PNG, WebP ou AVIF (recebido: {$detectedMime})."],
                ]);
            }

            $imageInfo = @getimagesize($tmpFile);
            if ($imageInfo === false) {
                throw ValidationException::withMessages([
                    'url' => ['Os dados recebidos estão corrompidos ou não formam uma imagem legível.'],
                ]);
            }

            $width = (int) $imageInfo[0];
            $height = (int) $imageInfo[1];
            if ($width < 32 || $height < 32) {
                throw ValidationException::withMessages([
                    'url' => ["A imagem encontrada ({$width}×{$height}px) é pequena demais para o catálogo."],
                ]);
            }

            $subDir = trim($folder, '/').'/'.now()->format('Y/m');
            $uuid = Str::uuid()->toString();
            $ext = self::ALLOWED_CATALOG_IMAGE_MIMES[$detectedMime][0];

            $optimized = $this->normalizeCatalogImageBytes($tmpFile, $detectedMime, $width, $height);
            if ($optimized !== null) {
                $finalBytes = $optimized['bytes'];
                $finalExt = $optimized['ext'];
                $finalMime = $optimized['mime'];
                $width = $optimized['width'];
                $height = $optimized['height'];
            } else {
                $finalBytes = $fetched['body'];
                $finalExt = $ext;
                $finalMime = $detectedMime;
            }

            $relativePath = "{$subDir}/{$uuid}.{$finalExt}";
            if (! Storage::disk('public')->put($relativePath, $finalBytes)) {
                throw ValidationException::withMessages([
                    'url' => ['Falha ao gravar imagem baixada no armazenamento da loja.'],
                ]);
            }

            $thumbPath = $this->generateCatalogThumb($tmpFile, $subDir, $uuid);

            $cleanTitle = $title ?: $this->inferTitleFromUrl($fetched['final_url']);
            $asset = MediaAsset::query()->create([
                'uploaded_by' => $actor?->id,
                'title' => mb_substr($cleanTitle, 0, 180),
                'disk' => 'public',
                'path' => '/storage/'.$relativePath,
                'mime_type' => $finalMime,
                'size_bytes' => strlen($finalBytes),
                'width' => $width,
                'height' => $height,
                'alt_text' => mb_substr($altText ?: $cleanTitle, 0, 255),
                'focal_point' => 'center',
            ]);

            return [
                'asset' => $asset,
                'path' => $asset->path,
                'thumb_path' => $thumbPath,
                'width' => $width,
                'height' => $height,
                'mime_type' => $finalMime,
                'size_bytes' => strlen($finalBytes),
                'source_url' => $fetched['final_url'],
            ];
        } finally {
            @unlink($tmpFile);
        }
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

    /**
     * Normalizes large imported catalog photos to WebP (up to 1200px max side) when GD WebP is available.
     *
     * @return array{bytes: string, ext: string, mime: string, width: int, height: int}|null
     */
    private function normalizeCatalogImageBytes(string $sourceFile, string $mime, int $width, int $height): ?array
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }
        if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return null;
        }

        $raw = @file_get_contents($sourceFile);
        if (! is_string($raw)) {
            return null;
        }

        $img = @imagecreatefromstring($raw);
        if ($img === false) {
            return null;
        }

        try {
            $maxSide = 1200;
            $targetW = $width;
            $targetH = $height;

            if ($width > $maxSide || $height > $maxSide) {
                $ratio = min($maxSide / $width, $maxSide / $height);
                $targetW = max(1, (int) round($width * $ratio));
                $targetH = max(1, (int) round($height * $ratio));
            }

            $canvas = imagecreatetruecolor($targetW, $targetH);
            if ($canvas === false) {
                return null;
            }

            try {
                imagealphablending($canvas, false);
                imagesavealpha($canvas, true);
                $transparent = imagecolorallocatealpha($canvas, 255, 255, 255, 127);
                if ($transparent !== false) {
                    imagefilledrectangle($canvas, 0, 0, $targetW, $targetH, $transparent);
                }
                imagecopyresampled($canvas, $img, 0, 0, 0, 0, $targetW, $targetH, $width, $height);

                ob_start();
                $ok = imagewebp($canvas, null, 88);
                $encoded = ob_get_clean();
                if (! $ok || ! is_string($encoded) || $encoded === '') {
                    return null;
                }

                return [
                    'bytes' => $encoded,
                    'ext' => 'webp',
                    'mime' => 'image/webp',
                    'width' => $targetW,
                    'height' => $targetH,
                ];
            } finally {
                imagedestroy($canvas);
            }
        } finally {
            imagedestroy($img);
        }
    }

    /**
     * Creates a compact WebP thumbnail next to the main catalog image when GD supports it.
     */
    private function generateCatalogThumb(string $sourceFile, string $subDir, string $uuid): ?string
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagewebp')) {
            return null;
        }

        $raw = @file_get_contents($sourceFile);
        if (! is_string($raw)) {
            return null;
        }

        $img = @imagecreatefromstring($raw);
        if ($img === false) {
            return null;
        }

        try {
            $srcW = imagesx($img);
            $srcH = imagesy($img);

            $maxThumb = 420;
            $ratio = min(1.0, $maxThumb / max($srcW, $srcH));
            $dstW = max(1, (int) round($srcW * $ratio));
            $dstH = max(1, (int) round($srcH * $ratio));

            $thumb = imagecreatetruecolor($dstW, $dstH);
            if ($thumb === false) {
                return null;
            }

            try {
                imagealphablending($thumb, false);
                imagesavealpha($thumb, true);
                $transparent = imagecolorallocatealpha($thumb, 255, 255, 255, 127);
                if ($transparent !== false) {
                    imagefilledrectangle($thumb, 0, 0, $dstW, $dstH, $transparent);
                }
                imagecopyresampled($thumb, $img, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);

                ob_start();
                $ok = imagewebp($thumb, null, 84);
                $bytes = ob_get_clean();
                if (! $ok || ! is_string($bytes) || $bytes === '') {
                    return null;
                }

                $thumbRel = "{$subDir}/{$uuid}-thumb.webp";
                if (Storage::disk('public')->put($thumbRel, $bytes)) {
                    return '/storage/'.$thumbRel;
                }

                return null;
            } finally {
                imagedestroy($thumb);
            }
        } finally {
            imagedestroy($img);
        }
    }

    private function inferTitleFromUrl(string $url): string
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        $name = pathinfo($path, PATHINFO_FILENAME);

        return $name !== '' ? str_replace(['-', '_'], ' ', $name) : 'produto-importado';
    }
}
