<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\ShippingQuote;
use App\Models\ShippingRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminShippingController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
    ) {}

    public function listRules(): JsonResponse
    {
        return response()->json(['data' => ShippingRule::query()->orderBy('id')->get()]);
    }

    public function storeRule(Request $request): JsonResponse
    {
        $validated = $this->validateRule($request);
        $rule = ShippingRule::query()->create($validated);
        $this->audit->record('shipping_rule.created', $request->user(), 'shipping_rule', $rule->id, null, ['code' => $rule->code], $request);

        return response()->json(['data' => $rule], 201);
    }

    public function updateRule(Request $request, int $id): JsonResponse
    {
        $rule = ShippingRule::query()->findOrFail($id);
        $validated = $this->validateRule($request, $rule->id);
        $rule->update($validated);
        $this->audit->record('shipping_rule.updated', $request->user(), 'shipping_rule', $rule->id, null, ['code' => $rule->code], $request);

        return response()->json(['data' => $rule->fresh()]);
    }

    public function destroyRule(int $id): JsonResponse
    {
        ShippingRule::query()->findOrFail($id)->delete();

        return response()->json(['message' => 'Regra de frete removida.']);
    }

    public function recentQuotes(): JsonResponse
    {
        return response()->json(['data' => ShippingQuote::query()->latest('id')->limit(50)->get()]);
    }

    /** @return array<string, mixed> */
    private function validateRule(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:60', Rule::unique('shipping_rules', 'code')->ignore($ignoreId)],
            'carrier' => ['required', 'string', 'max:80'],
            'mode' => ['required', Rule::in(['table', 'pickup', 'motoboy', 'free_rule'])],
            'min_subtotal_cents' => ['integer', 'min:0'],
            'max_weight_grams' => ['nullable', 'integer', 'min:1'],
            'regions_ufs' => ['nullable', 'array'],
            'cep_prefix_start' => ['nullable', 'string', 'max:8'],
            'cep_prefix_end' => ['nullable', 'string', 'max:8'],
            'base_price_cents' => ['integer', 'min:0'],
            'price_per_kg_cents' => ['integer', 'min:0'],
            'estimated_days' => ['integer', 'min:0'],
            'extra_prep_days' => ['integer', 'min:0'],
            'free_shipping_above_cents' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ]);

        $data['code'] = strtoupper(trim((string) $data['code']));

        return $data;
    }
}
