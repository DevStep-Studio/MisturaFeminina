<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Wholesale\Services\WholesaleBulkPricingService;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Domain\Wholesale\Services\WholesaleReportsService;
use App\Domain\Wholesale\Services\WholesaleResellerService;
use App\Domain\Wholesale\Services\WholesaleRuleService;
use App\Http\Controllers\Controller;
use App\Models\WholesaleCustomerGroup;
use App\Models\WholesaleCustomerGroupMember;
use App\Models\WholesaleGroup;
use App\Models\WholesaleRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class AdminWholesaleController extends Controller
{
    public function __construct(
        private readonly WholesalePricingService $pricingService,
        private readonly WholesaleRuleService $ruleService,
        private readonly WholesaleBulkPricingService $bulkService,
        private readonly WholesaleResellerService $resellerService,
        private readonly WholesaleReportsService $reportsService
    ) {}

    /**
     * Wholesale dashboard overview KPIs and status.
     */
    public function overview(): JsonResponse
    {
        $kpis = $this->reportsService->summary();
        $recentRules = WholesaleRule::query()->latest()->limit(5)->get();
        $pendingResellers = WholesaleCustomerGroupMember::query()
            ->where('status', 'pending')
            ->with(['user', 'group'])
            ->latest('requested_at')
            ->limit(5)
            ->get();

        return response()->json([
            'data' => [
                'kpis' => $kpis,
                'recent_rules' => $recentRules,
                'pending_resellers' => $pendingResellers,
            ],
        ]);
    }

    /**
     * List rules.
     */
    public function rules(Request $request): JsonResponse
    {
        $paginated = $this->ruleService->list($request->all());

        return response()->json($paginated);
    }

    /**
     * Create rule.
     */
    public function storeRule(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:140',
            'slug' => 'nullable|string|max:140',
            'description' => 'nullable|string',
            'status' => 'required|string|in:draft,scheduled,active,paused,ended',
            'access_mode' => 'required|string|in:open,exclusive,mixed',
            'quantity_scope' => 'required|string|in:sku,product,commercial_line,wholesale_group,category,order',
            'discount_policy' => 'required|string|in:tier_pricing,fixed_discount,percentage_discount',
            'stacking_policy' => 'required|string|in:no_stacking,allow_coupons,allow_promotions,best_discount_only',
            'min_quantity' => 'nullable|integer|min:1',
            'priority' => 'nullable|integer',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date',
            'tiers' => 'nullable|array',
            'tiers.*.min_quantity' => 'required|integer|min:1',
            'tiers.*.max_quantity' => 'nullable|integer|min:1',
            'tiers.*.discount_type' => 'required|string|in:fixed_price,percent,fixed_discount',
            'tiers.*.discount_value' => 'required|numeric|min:0.01',
            'products' => 'nullable|array',
            'products.*.product_id' => 'nullable|integer',
            'products.*.product_variant_id' => 'nullable|integer',
            'products.*.category_id' => 'nullable|integer',
            'products.*.wholesale_group_id' => 'nullable|integer',
            'products.*.is_excluded' => 'nullable|boolean',
            'customer_group_ids' => 'nullable|array',
            'customer_group_ids.*' => 'integer',
        ]);

        $rule = $this->ruleService->create($validated, $request->user());

        return response()->json(['data' => $rule, 'message' => 'Regra criada com sucesso.'], 201);
    }

    /**
     * Update rule.
     */
    public function updateRule(Request $request, WholesaleRule $rule): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:140',
            'slug' => 'nullable|string|max:140',
            'description' => 'nullable|string',
            'status' => 'sometimes|string|in:draft,scheduled,active,paused,ended',
            'access_mode' => 'sometimes|string|in:open,exclusive,mixed',
            'quantity_scope' => 'sometimes|string|in:sku,product,commercial_line,wholesale_group,category,order',
            'discount_policy' => 'sometimes|string|in:tier_pricing,fixed_discount,percentage_discount',
            'stacking_policy' => 'sometimes|string|in:no_stacking,allow_coupons,allow_promotions,best_discount_only',
            'min_quantity' => 'nullable|integer|min:1',
            'priority' => 'nullable|integer',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date',
            'tiers' => 'nullable|array',
            'tiers.*.min_quantity' => 'required|integer|min:1',
            'tiers.*.max_quantity' => 'nullable|integer|min:1',
            'tiers.*.discount_type' => 'required|string|in:fixed_price,percent,fixed_discount',
            'tiers.*.discount_value' => 'required|numeric|min:0.01',
            'products' => 'nullable|array',
            'customer_group_ids' => 'nullable|array',
        ]);

        $updated = $this->ruleService->update($rule, $validated, $request->user());

        return response()->json(['data' => $updated, 'message' => 'Regra atualizada com sucesso.']);
    }

    /**
     * Update rule status.
     */
    public function updateRuleStatus(Request $request, WholesaleRule $rule): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string|in:draft,scheduled,active,paused,ended',
        ]);

        $updated = $this->ruleService->updateStatus($rule, $validated['status'], $request->user());

        return response()->json(['data' => $updated, 'message' => 'Status da regra atualizado.']);
    }

    /**
     * Delete rule.
     */
    public function destroyRule(Request $request, WholesaleRule $rule): JsonResponse
    {
        $this->ruleService->delete($rule, $request->user());

        return response()->json(['message' => 'Regra excluída com sucesso.']);
    }

    /**
     * Bulk pricing grid.
     */
    public function bulkGrid(Request $request): JsonResponse
    {
        $grid = $this->bulkService->listGrid($request->all());

        return response()->json($grid);
    }

    /**
     * Parse clipboard pasted text from Excel/Sheets.
     */
    public function parseExcelPaste(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'pasted_text' => 'required|string',
        ]);

        $parsed = $this->bulkService->parseExcelPaste($validated['pasted_text']);

        return response()->json(['data' => $parsed]);
    }

    /**
     * Preview bulk update diff.
     */
    public function previewBulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array',
            'items.*.sku' => 'required|string',
            'items.*.wholesale_price_cents' => 'required|integer|min:1',
            'items.*.min_quantity' => 'nullable|integer|min:1',
        ]);

        $preview = $this->bulkService->previewBulkUpdate($validated['items']);

        return response()->json(['data' => $preview]);
    }

    /**
     * Apply bulk update changes.
     */
    public function applyBulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array',
            'items.*.sku' => 'required|string',
            'items.*.wholesale_price_cents' => 'required|integer|min:1',
            'items.*.min_quantity' => 'nullable|integer|min:1',
        ]);

        $result = $this->bulkService->applyBulkUpdate($validated['items'], $request->user());

        return response()->json($result);
    }

    /**
     * Wholesale commercial groups.
     */
    public function groups(): JsonResponse
    {
        $groups = WholesaleGroup::query()->withCount('items')->get();

        return response()->json(['data' => $groups]);
    }

    public function storeGroup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string',
            'status' => 'nullable|string|in:active,inactive',
            'product_ids' => 'nullable|array',
            'product_ids.*' => 'integer',
        ]);

        $slug = Str::slug($validated['name']);
        if (WholesaleGroup::query()->where('slug', $slug)->exists()) {
            $slug .= '-'.Str::lower(Str::random(4));
        }

        $group = WholesaleGroup::query()->create([
            'name' => $validated['name'],
            'slug' => $slug,
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'active',
        ]);

        if (! empty($validated['product_ids'])) {
            foreach ($validated['product_ids'] as $pid) {
                $group->items()->create(['product_id' => $pid]);
            }
        }

        return response()->json(['data' => $group->load('items'), 'message' => 'Grupo comercial criado com sucesso.'], 201);
    }

    public function updateGroup(Request $request, WholesaleGroup $group): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:120',
            'description' => 'nullable|string',
            'status' => 'nullable|string|in:active,inactive',
            'product_ids' => 'nullable|array',
            'product_ids.*' => 'integer',
        ]);

        $group->update([
            'name' => $validated['name'] ?? $group->name,
            'description' => array_key_exists('description', $validated) ? $validated['description'] : $group->description,
            'status' => $validated['status'] ?? $group->status,
        ]);

        if (array_key_exists('product_ids', $validated)) {
            $group->items()->delete();
            foreach ($validated['product_ids'] ?? [] as $pid) {
                $group->items()->create(['product_id' => $pid]);
            }
        }

        return response()->json(['data' => $group->fresh('items'), 'message' => 'Grupo atualizado com sucesso.']);
    }

    public function destroyGroup(WholesaleGroup $group): JsonResponse
    {
        $group->delete();

        return response()->json(['message' => 'Grupo comercial excluído.']);
    }

    /**
     * Reseller management.
     */
    public function resellers(Request $request): JsonResponse
    {
        $paginated = $this->resellerService->listMembers($request->all());

        return response()->json($paginated);
    }

    public function customerGroups(): JsonResponse
    {
        $groups = WholesaleCustomerGroup::query()->withCount('members')->get();

        return response()->json(['data' => $groups]);
    }

    public function approveReseller(Request $request, WholesaleCustomerGroupMember $member): JsonResponse
    {
        $groupId = $request->input('customer_group_id') ? (int) $request->input('customer_group_id') : null;
        $updated = $this->resellerService->approve($member, $request->user(), $groupId);

        return response()->json(['data' => $updated, 'message' => 'Revendedor aprovado com sucesso!']);
    }

    public function rejectReseller(Request $request, WholesaleCustomerGroupMember $member): JsonResponse
    {
        $reason = (string) $request->input('reason', 'Não atende aos critérios no momento.');
        $updated = $this->resellerService->reject($member, $request->user(), $reason);

        return response()->json(['data' => $updated, 'message' => 'Solicitação de revendedor rejeitada.']);
    }

    public function suspendReseller(Request $request, WholesaleCustomerGroupMember $member): JsonResponse
    {
        $reason = $request->input('reason') ? (string) $request->input('reason') : null;
        $updated = $this->resellerService->suspend($member, $request->user(), $reason);

        return response()->json(['data' => $updated, 'message' => 'Revendedor suspenso.']);
    }

    public function reactivateReseller(Request $request, WholesaleCustomerGroupMember $member): JsonResponse
    {
        $updated = $this->resellerService->reactivate($member, $request->user());

        return response()->json(['data' => $updated, 'message' => 'Revendedor reativado com sucesso.']);
    }

    /**
     * Wholesale Simulator endpoint (0 side effects).
     */
    public function simulate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|integer',
            'items.*.product_variant_id' => 'nullable|integer',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.unit_price_cents' => 'nullable|integer',
            'customer_group_id' => 'nullable|integer',
            'coupon_code' => 'nullable|string',
        ]);

        $customerGroupId = ! empty($validated['customer_group_id']) ? (int) $validated['customer_group_id'] : null;
        $couponCode = ! empty($validated['coupon_code']) ? (string) $validated['coupon_code'] : null;

        $result = $this->pricingService->simulate($validated['items'], $request->user(), $customerGroupId, $couponCode);

        return response()->json(['data' => $result]);
    }

    /**
     * Wholesale Reports.
     */
    public function reports(): JsonResponse
    {
        return response()->json([
            'data' => [
                'summary' => $this->reportsService->summary(),
                'top_products' => $this->reportsService->topProducts(10),
                'rule_performance' => $this->reportsService->rulePerformance(),
            ],
        ]);
    }

    /**
     * Export wholesale CSV.
     */
    public function exportCsv(): Response
    {
        $csv = $this->reportsService->exportCsv();

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="relatorio_atacado_'.now()->format('Ymd_His').'.csv"',
        ]);
    }
}
