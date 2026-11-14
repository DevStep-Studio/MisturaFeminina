<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Models\NewsletterSubscription;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class AdminMarketingController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
    ) {}

    public function listCoupons(): JsonResponse
    {
        return response()->json(['data' => Coupon::query()->latest('id')->get()]);
    }

    public function storeCoupon(Request $request): JsonResponse
    {
        $validated = $this->validateCoupon($request);
        $coupon = Coupon::query()->create($validated);
        $this->audit->record('coupon.created', $request->user(), 'coupon', $coupon->id, null, ['code' => $coupon->code], $request);

        return response()->json(['data' => $coupon], 201);
    }

    public function updateCoupon(Request $request, int $id): JsonResponse
    {
        $coupon = Coupon::query()->findOrFail($id);
        $validated = $this->validateCoupon($request, $coupon->id);
        $coupon->update($validated);
        $this->audit->record('coupon.updated', $request->user(), 'coupon', $coupon->id, null, ['code' => $coupon->code], $request);

        return response()->json(['data' => $coupon->fresh()]);
    }

    public function destroyCoupon(Request $request, int $id): JsonResponse
    {
        $coupon = Coupon::query()->findOrFail($id);
        $coupon->delete();
        $this->audit->record('coupon.deleted', $request->user(), 'coupon', $id, null, null, $request);

        return response()->json(['message' => 'Cupom removido.']);
    }

    public function listPromotions(): JsonResponse
    {
        return response()->json(['data' => Promotion::query()->orderBy('priority')->get()]);
    }

    public function storePromotion(Request $request): JsonResponse
    {
        $validated = $this->validatePromotion($request);
        $promo = Promotion::query()->create($validated);

        return response()->json(['data' => $promo], 201);
    }

    public function updatePromotion(Request $request, int $id): JsonResponse
    {
        $promo = Promotion::query()->findOrFail($id);
        $validated = $this->validatePromotion($request);
        $promo->update($validated);

        return response()->json(['data' => $promo->fresh()]);
    }

    public function destroyPromotion(int $id): JsonResponse
    {
        Promotion::query()->findOrFail($id)->delete();

        return response()->json(['message' => 'Promoção removida.']);
    }

    public function listNewsletter(): JsonResponse
    {
        return response()->json(NewsletterSubscription::query()->latest('id')->paginate(50));
    }

    public function exportNewsletter(): Response
    {
        $rows = NewsletterSubscription::query()->whereNull('unsubscribed_at')->orderBy('id')->get();
        $lines = ['email;name;confirmed_at;created_at'];
        foreach ($rows as $row) {
            $lines[] = implode(';', [
                $row->email,
                str_replace(';', ',', (string) ($row->name ?? '')),
                $row->confirmed_at?->toIso8601String() ?? '',
                $row->created_at?->toIso8601String() ?? '',
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="newsletter-mistura-feminina.csv"',
        ]);
    }

    /** @return array<string, mixed> */
    private function validateCoupon(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:60', Rule::unique('coupons', 'code')->ignore($ignoreId)],
            'name' => ['required', 'string', 'max:150'],
            'type' => ['required', Rule::in(['percent', 'fixed', 'free_shipping'])],
            'value' => ['required', 'integer', 'min:0'],
            'min_subtotal_cents' => ['integer', 'min:0'],
            'max_discount_cents' => ['nullable', 'integer', 'min:1'],
            'max_uses' => ['nullable', 'integer', 'min:1'],
            'max_uses_per_user' => ['integer', 'min:1'],
            'first_purchase_only' => ['boolean'],
            'is_cumulative' => ['boolean'],
            'allowed_states' => ['nullable', 'array'],
            'scope_type' => ['required', Rule::in(['all', 'category', 'brand', 'product'])],
            'scope_ids' => ['nullable', 'array'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'is_active' => ['boolean'],
        ]);

        $data['code'] = strtoupper(trim((string) $data['code']));

        return $data;
    }

    /** @return array<string, mixed> */
    private function validatePromotion(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'rule_type' => ['required', Rule::in(['category_discount', 'brand_discount', 'cart_threshold', 'quantity_tier'])],
            'discount_type' => ['required', Rule::in(['percent', 'fixed'])],
            'value' => ['required', 'integer', 'min:1'],
            'scope_type' => ['required', Rule::in(['all', 'category', 'brand', 'product'])],
            'scope_ids' => ['nullable', 'array'],
            'min_qty' => ['integer', 'min:1'],
            'min_subtotal_cents' => ['integer', 'min:0'],
            'priority' => ['integer', 'min:0'],
            'is_cumulative' => ['boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'is_active' => ['boolean'],
        ]);
    }
}
