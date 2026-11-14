<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Media\Services\MediaUploadService;
use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Models\ContentPage;
use App\Models\HomeSection;
use App\Models\MediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminContentController extends Controller
{
    public function __construct(
        private readonly MediaUploadService $media,
        private readonly AuditLogger $audit,
    ) {}

    public function listMedia(): JsonResponse
    {
        return response()->json(['data' => MediaAsset::query()->latest('id')->limit(100)->get()]);
    }

    public function uploadMedia(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:5120'],
            'title' => ['nullable', 'string', 'max:180'],
            'alt_text' => ['nullable', 'string', 'max:255'],
            'folder' => ['nullable', 'string', 'max:60'],
        ]);

        $asset = $this->media->uploadImage(
            $request->file('file'),
            $request->user(),
            $validated['title'] ?? null,
            $validated['alt_text'] ?? null,
            $validated['folder'] ?? 'uploads',
        );

        $this->audit->record('media.uploaded', $request->user(), 'media_asset', $asset->id, null, ['path' => $asset->path], $request);

        return response()->json(['data' => $asset], 201);
    }

    public function listBanners(): JsonResponse
    {
        return response()->json(['data' => Banner::query()->orderBy('placement')->orderBy('sort_order')->get()]);
    }

    public function storeBanner(Request $request): JsonResponse
    {
        $validated = $this->validateBanner($request);
        $banner = Banner::query()->create($validated);
        $this->audit->record('banner.created', $request->user(), 'banner', $banner->id, null, ['title' => $banner->title], $request);

        return response()->json(['data' => $banner], 201);
    }

    public function updateBanner(Request $request, int $id): JsonResponse
    {
        $banner = Banner::query()->findOrFail($id);
        $validated = $this->validateBanner($request);
        $banner->update($validated);
        $this->audit->record('banner.updated', $request->user(), 'banner', $banner->id, null, ['title' => $banner->title], $request);

        return response()->json(['data' => $banner->fresh()]);
    }

    public function destroyBanner(Request $request, int $id): JsonResponse
    {
        $banner = Banner::query()->findOrFail($id);
        $banner->delete();
        $this->audit->record('banner.deleted', $request->user(), 'banner', $id, null, null, $request);

        return response()->json(['message' => 'Banner removido.']);
    }

    public function reorderBanners(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['integer', 'exists:banners,id'],
        ]);

        foreach ($validated['ordered_ids'] as $index => $bannerId) {
            Banner::query()->whereKey((int) $bannerId)->update(['sort_order' => $index]);
        }

        return response()->json(['data' => Banner::query()->orderBy('placement')->orderBy('sort_order')->get()]);
    }

    public function listHomeSections(): JsonResponse
    {
        return response()->json(['data' => HomeSection::query()->orderBy('sort_order')->get()]);
    }

    public function updateHomeSections(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sections' => ['required', 'array'],
            'sections.*.id' => ['required', 'integer', 'exists:home_sections,id'],
            'sections.*.title' => ['nullable', 'string', 'max:180'],
            'sections.*.subtitle' => ['nullable', 'string', 'max:255'],
            'sections.*.config' => ['nullable', 'array'],
            'sections.*.sort_order' => ['required', 'integer', 'min:0'],
            'sections.*.is_active' => ['required', 'boolean'],
        ]);

        foreach ($validated['sections'] as $item) {
            HomeSection::query()->whereKey((int) $item['id'])->update([
                'title' => $item['title'] ?? null,
                'subtitle' => $item['subtitle'] ?? null,
                'config' => $item['config'] ?? [],
                'sort_order' => (int) $item['sort_order'],
                'is_active' => (bool) $item['is_active'],
            ]);
        }

        Cache::flush();
        $this->audit->record('home_sections.updated', $request->user(), 'home_section', null, null, ['count' => count($validated['sections'])], $request);

        return response()->json(['data' => HomeSection::query()->orderBy('sort_order')->get()]);
    }

    public function listPages(): JsonResponse
    {
        return response()->json(['data' => ContentPage::query()->orderBy('sort_order')->orderBy('title')->get()]);
    }

    public function storePage(Request $request): JsonResponse
    {
        $validated = $this->validatePage($request);
        $slug = Str::slug((string) ($validated['slug'] ?? $validated['title']));
        if (ContentPage::query()->where('slug', $slug)->exists()) {
            $slug .= '-'.strtolower(Str::random(4));
        }

        $page = ContentPage::query()->create(array_merge($validated, ['slug' => $slug]));

        return response()->json(['data' => $page], 201);
    }

    public function updatePage(Request $request, int $id): JsonResponse
    {
        $page = ContentPage::query()->findOrFail($id);
        $validated = $this->validatePage($request, $page->id);
        $page->update($validated);

        return response()->json(['data' => $page->fresh()]);
    }

    /** @return array<string, mixed> */
    private function validateBanner(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'placement' => ['required', Rule::in(['hero', 'promo_grid', 'category_top', 'popup'])],
            'desktop_image_path' => ['required', 'string', 'max:500'],
            'mobile_image_path' => ['nullable', 'string', 'max:500'],
            'alt_text' => ['required', 'string', 'max:255'],
            'cta_label' => ['nullable', 'string', 'max:80'],
            'cta_url' => ['nullable', 'string', 'max:500'],
            'sort_order' => ['integer', 'min:0'],
            'is_active' => ['boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
        ]);
    }

    /** @return array<string, mixed> */
    private function validatePage(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'slug' => ['nullable', 'string', 'max:160', Rule::unique('content_pages', 'slug')->ignore($ignoreId)],
            'content_html' => ['required', 'string'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
            'is_published' => ['boolean'],
            'show_in_footer' => ['boolean'],
            'footer_group' => ['nullable', 'string', 'max:60'],
            'sort_order' => ['integer', 'min:0'],
        ]);
    }
}
