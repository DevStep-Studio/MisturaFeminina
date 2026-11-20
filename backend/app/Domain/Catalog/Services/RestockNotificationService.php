<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Catalog\Events\VariantRestocked;
use App\Mail\RestockAvailableMail;
use App\Models\IntegrationSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RestockNotificationService
{
    /**
     * @param  array<string, mixed>  $data
     * @return array{request: RestockRequest, duplicate: bool}
     */
    public function subscribe(Product $product, ?ProductVariant $variant, array $data, ?User $user = null): array
    {
        $activeVariants = $product->variants()->where('is_active', true)->get();
        if (! $variant) {
            if ($activeVariants->count() > 1) {
                throw ValidationException::withMessages([
                    'variant_id' => ['Selecione uma tonalidade específica para receber o aviso de reposição.'],
                ]);
            }
            $variant = $activeVariants->firstWhere('is_default', true) ?? $activeVariants->first();
        }

        if (! $variant || (int) $variant->product_id !== (int) $product->id || ! $variant->is_active) {
            throw ValidationException::withMessages([
                'variant_id' => ['Tonalidade não encontrada para este produto.'],
            ]);
        }

        if ($variant->availableStock() > 0) {
            throw ValidationException::withMessages([
                'variant_id' => ['Esta tonalidade já está disponível em estoque.'],
            ]);
        }

        $rawChannel = $data['channel'] ?? 'email';
        $channel = in_array($rawChannel, ['email', 'whatsapp'], true)
            ? (string) $rawChannel
            : 'email';
        $email = strtolower(trim((string) ($data['email'] ?? ($user->email ?? ''))));
        $phone = isset($data['phone']) ? preg_replace('/\D/', '', (string) $data['phone']) : null;
        if ($phone === '') {
            $phone = null;
        }

        if ($channel === 'email' && ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL))) {
            throw ValidationException::withMessages([
                'email' => ['Informe um endereço de e-mail válido.'],
            ]);
        }
        if ($channel === 'whatsapp' && (! $phone || strlen($phone) < 10)) {
            throw ValidationException::withMessages([
                'phone' => ['Informe um número de WhatsApp válido com DDD.'],
            ]);
        }

        $existingQuery = RestockRequest::query()
            ->where('product_variant_id', $variant->id)
            ->where('status', 'pending');

        if ($channel === 'whatsapp') {
            $existingQuery->where(function ($q) use ($phone, $email): void {
                $q->where('phone', $phone);
                if ($email !== '') {
                    $q->orWhere('email', $email);
                }
            });
        } else {
            $existingQuery->where('email', $email);
        }

        $existing = $existingQuery->first();
        if ($existing) {
            return ['request' => $existing, 'duplicate' => true];
        }

        $request = RestockRequest::query()->create([
            'product_id' => $product->id,
            'product_variant_id' => $variant->id,
            'user_id' => $user?->id,
            'email' => $email !== '' ? $email : "whatsapp-{$phone}@noreply.local",
            'name' => isset($data['name']) ? trim((string) $data['name']) ?: ($user?->name) : ($user?->name),
            'channel' => $channel,
            'phone' => $phone,
            'consent_given' => (bool) ($data['consent_given'] ?? true),
            'consented_at' => now(),
            'unsubscribe_token' => Str::random(48),
            'status' => 'pending',
        ]);

        return ['request' => $request->load(['product:id,name,slug', 'variant:id,name,shade_code,sku']), 'duplicate' => false];
    }

    public function cancelByToken(string $token): RestockRequest
    {
        $request = RestockRequest::query()
            ->where('unsubscribe_token', $token)
            ->firstOrFail();

        if ($request->status === 'pending') {
            $request->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
            ]);
        }

        return $request->fresh();
    }

    public function cancelForUser(User $user, int $id): RestockRequest
    {
        $request = RestockRequest::query()
            ->where('id', $id)
            ->where(function ($q) use ($user): void {
                $q->where('user_id', $user->id)
                    ->orWhere('email', strtolower($user->email));
            })
            ->firstOrFail();

        if ($request->status === 'pending') {
            $request->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
            ]);
        }

        return $request->fresh();
    }

    public function handleVariantRestocked(VariantRestocked $event): int
    {
        $variant = $event->variant->fresh(['product']);
        if (! $variant || ! $variant->is_active || ! $variant->product || ! $variant->product->is_active) {
            return 0;
        }

        if ($variant->availableStock() <= 0) {
            return 0;
        }

        $requests = RestockRequest::query()
            ->where('status', 'pending')
            ->where(function ($q) use ($variant): void {
                $q->where('product_variant_id', $variant->id)
                    ->orWhere(function ($q2) use ($variant): void {
                        $q2->whereNull('product_variant_id')
                            ->where('product_id', $variant->product_id);
                    });
            })
            ->get();

        $whatsappConfigured = $this->hasOfficialWhatsappIntegration();
        $processed = 0;

        foreach ($requests as $req) {
            // Re-check live stock before each dispatch so oversold/zeroed variants are skipped.
            $variant->refresh();
            if ($variant->availableStock() <= 0) {
                break;
            }

            $attempts = (int) $req->attempts_count + 1;

            if ($req->channel === 'whatsapp' && ! $whatsappConfigured) {
                if (filter_var($req->email, FILTER_VALIDATE_EMAIL) && ! str_ends_with($req->email, '@noreply.local')) {
                    Mail::to($req->email)->queue(new RestockAvailableMail($variant->product, $variant));
                    $req->update([
                        'status' => 'notified',
                        'notified_at' => now(),
                        'attempts_count' => $attempts,
                        'last_error' => 'Canal WhatsApp oficial não configurado; aviso enviado por e-mail.',
                    ]);
                    $processed++;
                } else {
                    $req->update([
                        'status' => 'failed',
                        'attempts_count' => $attempts,
                        'last_error' => 'Integração oficial WhatsApp Business não configurada no painel administrativo.',
                    ]);
                }

                continue;
            }

            if (! filter_var($req->email, FILTER_VALIDATE_EMAIL) || str_ends_with($req->email, '@noreply.local')) {
                $req->update([
                    'status' => 'failed',
                    'attempts_count' => $attempts,
                    'last_error' => 'E-mail inválido para envio da notificação.',
                ]);

                continue;
            }

            try {
                Mail::to($req->email)->queue(new RestockAvailableMail($variant->product, $variant));
                $req->update([
                    'status' => 'notified',
                    'notified_at' => now(),
                    'attempts_count' => $attempts,
                    'last_error' => null,
                ]);
                $processed++;
            } catch (\Throwable $e) {
                $req->update([
                    'status' => 'failed',
                    'attempts_count' => $attempts,
                    'last_error' => mb_substr($e->getMessage(), 0, 480),
                ]);
            }
        }

        return $processed;
    }

    public function hasOfficialWhatsappIntegration(): bool
    {
        $setting = IntegrationSetting::query()
            ->where('provider', 'whatsapp_business')
            ->where('is_active', true)
            ->first();

        if (! $setting) {
            return false;
        }

        $creds = $setting->encrypted_credentials ?? [];

        return ! empty($creds['access_token']) && ! empty($creds['phone_number_id']);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function demandSummary(array $filters = []): array
    {
        $statusCounts = RestockRequest::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $demandRanking = DB::table('restock_requests')
            ->join('products', 'restock_requests.product_id', '=', 'products.id')
            ->leftJoin('brands', 'products.brand_id', '=', 'brands.id')
            ->leftJoin('product_variants', 'restock_requests.product_variant_id', '=', 'product_variants.id')
            ->where('restock_requests.status', 'pending')
            ->selectRaw('
                restock_requests.product_id,
                restock_requests.product_variant_id,
                products.name as product_name,
                products.slug as product_slug,
                brands.name as brand_name,
                COALESCE(product_variants.name, "Padrão") as variant_name,
                product_variants.shade_code as shade_code,
                COALESCE(product_variants.sku, products.sku) as sku,
                COALESCE(product_variants.stock_qty - product_variants.reserved_qty, 0) as available_stock,
                COUNT(restock_requests.id) as waiting_count,
                MIN(restock_requests.created_at) as oldest_request_at
            ')
            ->groupBy(
                'restock_requests.product_id',
                'restock_requests.product_variant_id',
                'products.name',
                'products.slug',
                'brands.name',
                'product_variants.name',
                'product_variants.shade_code',
                'product_variants.sku',
                'products.sku',
                'product_variants.stock_qty',
                'product_variants.reserved_qty'
            )
            ->orderByDesc('waiting_count')
            ->orderBy('oldest_request_at')
            ->limit(30)
            ->get()
            ->map(fn (object $row): array => [
                'product_id' => (int) $row->product_id,
                'product_variant_id' => $row->product_variant_id !== null ? (int) $row->product_variant_id : null,
                'product_name' => (string) $row->product_name,
                'product_slug' => (string) $row->product_slug,
                'brand_name' => $row->brand_name ? (string) $row->brand_name : null,
                'variant_name' => (string) $row->variant_name,
                'shade_code' => $row->shade_code ? (string) $row->shade_code : null,
                'sku' => (string) $row->sku,
                'available_stock' => max(0, (int) $row->available_stock),
                'waiting_count' => (int) $row->waiting_count,
                'oldest_request_at' => $row->oldest_request_at ? (string) $row->oldest_request_at : null,
            ])
            ->values()
            ->all();

        $requestsQuery = RestockRequest::query()
            ->with([
                'product:id,name,slug,brand_id',
                'product.brand:id,name',
                'variant:id,name,shade_code,sku,stock_qty,reserved_qty',
            ])
            ->latest('id');

        if (! empty($filters['status'])) {
            $requestsQuery->where('status', (string) $filters['status']);
        }
        if (! empty($filters['product_id'])) {
            $requestsQuery->where('product_id', (int) $filters['product_id']);
        }
        if (! empty($filters['variant_id'])) {
            $requestsQuery->where('product_variant_id', (int) $filters['variant_id']);
        }
        if (! empty($filters['brand_id'])) {
            $brandId = (int) $filters['brand_id'];
            $requestsQuery->whereHas('product', fn ($q) => $q->where('brand_id', $brandId));
        }
        if (! empty($filters['search'])) {
            $term = '%'.trim((string) $filters['search']).'%';
            $requestsQuery->where(function ($q) use ($term): void {
                $q->whereHas('product', fn ($pq) => $pq->where('name', 'like', $term))
                    ->orWhereHas('variant', fn ($vq) => $vq->where('name', 'like', $term)->orWhere('sku', 'like', $term)->orWhere('shade_code', 'like', $term));
            });
        }

        $requests = $requestsQuery->paginate(25);
        // Mask personal contact data in admin summary list while keeping channel/status operational.
        $requests->getCollection()->transform(function (RestockRequest $req): array {
            return [
                'id' => $req->id,
                'product' => $req->product ? [
                    'id' => $req->product->id,
                    'name' => $req->product->name,
                    'slug' => $req->product->slug,
                    'brand' => $req->product->brand?->name,
                ] : null,
                'variant' => $req->variant ? [
                    'id' => $req->variant->id,
                    'name' => $req->variant->name,
                    'shade_code' => $req->variant->shade_code,
                    'sku' => $req->variant->sku,
                    'available_stock' => $req->variant->availableStock(),
                ] : null,
                'channel' => $req->channel,
                'contact_masked' => $this->maskEmailOrPhone($req->email, $req->phone, $req->channel),
                'status' => $req->status,
                'attempts_count' => $req->attempts_count,
                'last_error' => $req->last_error,
                'notified_at' => $req->notified_at?->toIso8601String(),
                'created_at' => $req->created_at?->toIso8601String(),
            ];
        });

        return [
            'kpis' => [
                'pending_count' => (int) ($statusCounts['pending'] ?? 0),
                'notified_count' => (int) ($statusCounts['notified'] ?? 0),
                'failed_count' => (int) ($statusCounts['failed'] ?? 0),
                'cancelled_count' => (int) ($statusCounts['cancelled'] ?? 0),
                'demanded_variants_count' => count($demandRanking),
                'whatsapp_configured' => $whatsappConfigured = $this->hasOfficialWhatsappIntegration(),
            ],
            'demand_ranking' => $demandRanking,
            'requests' => $requests,
        ];
    }

    private function maskEmailOrPhone(string $email, ?string $phone, string $channel): string
    {
        if ($channel === 'whatsapp' && $phone) {
            return substr($phone, 0, 2).'****'.substr($phone, -4);
        }
        $parts = explode('@', $email);
        if (count($parts) !== 2) {
            return '***';
        }
        $local = $parts[0];
        $prefix = mb_substr($local, 0, min(2, mb_strlen($local)));

        return "{$prefix}***@{$parts[1]}";
    }
}
