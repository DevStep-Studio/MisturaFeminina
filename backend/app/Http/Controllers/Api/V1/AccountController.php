<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Security\Services\AuditLogger;
use App\Domain\Security\Services\TotpService;
use App\Http\Controllers\Controller;
use App\Models\LgpdRequest;
use App\Models\Order;
use App\Models\User;
use App\Models\Wishlist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AccountController extends Controller
{
    public function __construct(
        private readonly TotpService $totp,
        private readonly AuditLogger $audit,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->load(['customerProfile', 'addresses']);

        $recentOrders = Order::query()
            ->where('user_id', $user->id)
            ->with(['latestPayment:id,order_id,method,status,installments', 'shipment:id,order_id,carrier,service_name,tracking_code,tracking_url'])
            ->latest('id')
            ->limit(10)
            ->get();

        return response()->json([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'cpf_cnpj' => $user->cpf_cnpj,
                    'two_factor_enabled' => $user->two_factor_confirmed_at !== null,
                    'customer_profile' => $user->customerProfile,
                ],
                'addresses' => $user->addresses()->orderByDesc('is_default')->orderByDesc('id')->get(),
                'recent_orders' => $recentOrders,
                'orders_count' => Order::query()->where('user_id', $user->id)->count(),
                'wishlist_count' => Wishlist::query()->where('user_id', $user->id)->count(),
            ],
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cpf_cnpj' => ['nullable', 'string', 'max:20'],
            'birth_date' => ['nullable', 'date'],
            'newsletter_opt_in' => ['boolean'],
            'whatsapp_opt_in' => ['boolean'],
        ]);

        $user->update([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? $user->phone,
            'cpf_cnpj' => $validated['cpf_cnpj'] ?? $user->cpf_cnpj,
        ]);

        $profile = $user->customerProfile()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'birth_date' => $validated['birth_date'] ?? null,
                'newsletter_opt_in' => (bool) ($validated['newsletter_opt_in'] ?? false),
                'newsletter_opt_in_at' => ! empty($validated['newsletter_opt_in']) ? now() : null,
                'whatsapp_opt_in' => (bool) ($validated['whatsapp_opt_in'] ?? false),
            ]
        );

        return response()->json([
            'data' => [
                'user' => $user->fresh(['customerProfile']),
                'customer_profile' => $profile,
            ],
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['A senha atual está incorreta.'],
            ]);
        }

        $user->update(['password' => $validated['password'], 'must_reset_password' => false]);
        $this->audit->record('account.password_updated', $user, 'user', $user->id, null, null, $request);

        return response()->json(['message' => 'Senha atualizada com sucesso.']);
    }

    public function listAddresses(Request $request): JsonResponse
    {
        $addresses = $request->user()->addresses()->orderByDesc('is_default')->orderByDesc('id')->get();

        return response()->json(['data' => $addresses]);
    }

    public function storeAddress(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $this->validateAddress($request);

        if (! empty($validated['is_default'])) {
            $user->addresses()->update(['is_default' => false]);
        } elseif (! $user->addresses()->exists()) {
            $validated['is_default'] = true;
        }

        $address = $user->addresses()->create($validated);

        return response()->json(['data' => $address], 201);
    }

    public function updateAddress(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $address = $user->addresses()->findOrFail($id);
        $validated = $this->validateAddress($request);

        if (! empty($validated['is_default'])) {
            $user->addresses()->where('id', '!=', $address->id)->update(['is_default' => false]);
        }

        $address->update($validated);

        return response()->json(['data' => $address->fresh()]);
    }

    public function destroyAddress(Request $request, int $id): JsonResponse
    {
        $address = $request->user()->addresses()->findOrFail($id);
        $address->delete();

        return response()->json(['message' => 'Endereço removido.']);
    }

    public function orders(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->where('user_id', $request->user()->id)
            ->with(['items', 'latestPayment', 'shipment'])
            ->latest('id')
            ->paginate(15);

        return response()->json($orders);
    }

    public function showOrder(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::query()
            ->where('user_id', $request->user()->id)
            ->where('order_number', $orderNumber)
            ->with(['items', 'payments', 'statusHistories', 'shipment.trackingEvents'])
            ->firstOrFail();

        return response()->json(['data' => $order]);
    }

    public function listWishlist(Request $request): JsonResponse
    {
        $items = Wishlist::query()
            ->where('user_id', $request->user()->id)
            ->with(['product.images', 'product.brand', 'product.variants'])
            ->latest('id')
            ->get()
            ->pluck('product')
            ->filter()
            ->values();

        return response()->json(['data' => $items]);
    }

    public function toggleWishlist(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $existing = Wishlist::query()
            ->where('user_id', $user->id)
            ->where('product_id', (int) $validated['product_id'])
            ->first();

        if ($existing) {
            $existing->delete();

            return response()->json(['data' => ['favorited' => false]]);
        }

        Wishlist::query()->create([
            'user_id' => $user->id,
            'product_id' => (int) $validated['product_id'],
        ]);

        return response()->json(['data' => ['favorited' => true]], 201);
    }

    public function lgpdExport(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->load(['customerProfile', 'addresses', 'orders.items', 'wishlists']);

        $this->audit->record('account.lgpd_export', $user, 'user', $user->id, null, null, $request);

        return response()->json([
            'data' => [
                'exported_at' => now()->toIso8601String(),
                'account' => [
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'cpf_cnpj' => $user->cpf_cnpj,
                    'created_at' => $user->created_at?->toIso8601String(),
                ],
                'profile' => $user->customerProfile,
                'addresses' => $user->addresses,
                'orders' => $user->orders,
                'lgpd_requests' => LgpdRequest::query()->where('user_id', $user->id)->latest('id')->get(),
            ],
        ]);
    }

    public function lgpdRequest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['export', 'anonymization', 'deletion'])],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $lgpd = LgpdRequest::query()->create([
            'user_id' => $user->id,
            'email' => $user->email,
            'type' => $validated['type'],
            'status' => 'pending',
            'notes' => $validated['notes'] ?? null,
        ]);

        $this->audit->record('account.lgpd_request_created', $user, 'lgpd_request', $lgpd->id, null, ['type' => $lgpd->type], $request);

        return response()->json(['data' => $lgpd], 201);
    }

    public function setupTwoFactor(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $secret = $this->totp->generateSecret();
        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_confirmed_at' => null,
        ])->save();

        return response()->json([
            'data' => [
                'secret' => $secret,
                'provisioning_uri' => $this->totp->provisioningUri($user->email, $secret),
            ],
        ]);
    }

    public function confirmTwoFactor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:10'],
        ]);

        /** @var User $user */
        $user = $request->user();
        if (! $user->two_factor_secret || ! $this->totp->verify((string) $user->two_factor_secret, $validated['code'])) {
            throw ValidationException::withMessages(['code' => ['Código TOTP inválido.']]);
        }

        $recoveryCodes = [];
        for ($i = 0; $i < 8; $i++) {
            $recoveryCodes[] = strtoupper(Str::random(4).'-'.Str::random(4));
        }

        $user->forceFill([
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => $recoveryCodes,
        ])->save();

        $this->audit->record('account.2fa_enabled', $user, 'user', $user->id, null, null, $request);

        return response()->json([
            'data' => [
                'recovery_codes' => $recoveryCodes,
            ],
        ]);
    }

    public function disableTwoFactor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
        ]);

        /** @var User $user */
        $user = $request->user();
        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['Senha atual incorreta.']]);
        }

        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_recovery_codes' => null,
        ])->save();

        $this->audit->record('account.2fa_disabled', $user, 'user', $user->id, null, null, $request);

        return response()->json(['message' => 'Autenticação em duas etapas desativada.']);
    }

    /** @return array<string, mixed> */
    private function validateAddress(Request $request): array
    {
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:60'],
            'recipient_name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cep' => ['required', 'string', 'min:8', 'max:9'],
            'street' => ['required', 'string', 'max:180'],
            'number' => ['required', 'string', 'max:30'],
            'complement' => ['nullable', 'string', 'max:120'],
            'neighborhood' => ['required', 'string', 'max:120'],
            'city' => ['required', 'string', 'max:120'],
            'state' => ['required', 'string', 'size:2'],
            'is_default' => ['boolean'],
        ]);

        $digits = preg_replace('/\D/', '', (string) $data['cep']) ?? '';
        $data['cep'] = strlen($digits) === 8 ? substr($digits, 0, 5).'-'.substr($digits, 5, 3) : $data['cep'];
        $data['state'] = strtoupper((string) $data['state']);
        $data['label'] = $data['label'] ?? 'Principal';

        return $data;
    }
}
