<?php

declare(strict_types=1);

namespace App\Domain\Wholesale\Services;

use App\Models\User;
use App\Models\WholesaleRule;
use App\Models\WholesaleRuleAudit;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WholesaleRuleService
{
    /**
     * List wholesale rules with filtering and pagination.
     *
     * @param  array<string, mixed>  $filters
     */
    public function list(array $filters = []): LengthAwarePaginator
    {
        $query = WholesaleRule::query()
            ->with(['tiers', 'ruleProducts.product', 'ruleProducts.variant', 'ruleProducts.group', 'customerGroups', 'createdBy'])
            ->withCount(['tiers', 'ruleProducts', 'customerGroups']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['access_mode'])) {
            $query->where('access_mode', $filters['access_mode']);
        }

        if (! empty($filters['search'])) {
            $s = trim((string) $filters['search']);
            $query->where(function ($q) use ($s): void {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('slug', 'like', "%{$s}%")
                    ->orWhere('description', 'like', "%{$s}%");
            });
        }

        return $query->orderByDesc('priority')->orderByDesc('id')->paginate((int) ($filters['per_page'] ?? 15));
    }

    /**
     * Create a new wholesale rule with tiers and assignments.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data, ?User $creator = null): WholesaleRule
    {
        return DB::transaction(function () use ($data, $creator) {
            $slug = ! empty($data['slug']) ? Str::slug((string) $data['slug']) : Str::slug((string) $data['name']);
            if (WholesaleRule::query()->where('slug', $slug)->exists()) {
                $slug .= '-'.Str::lower(Str::random(5));
            }

            /** @var WholesaleRule $rule */
            $rule = WholesaleRule::query()->create([
                'name' => (string) $data['name'],
                'slug' => $slug,
                'description' => $data['description'] ?? null,
                'status' => $data['status'] ?? 'active',
                'access_mode' => $data['access_mode'] ?? 'open',
                'quantity_scope' => $data['quantity_scope'] ?? 'commercial_line',
                'discount_policy' => $data['discount_policy'] ?? 'tier_pricing',
                'stacking_policy' => $data['stacking_policy'] ?? 'no_stacking',
                'min_quantity' => (int) ($data['min_quantity'] ?? 1),
                'priority' => (int) ($data['priority'] ?? 0),
                'starts_at' => ! empty($data['starts_at']) ? $data['starts_at'] : null,
                'ends_at' => ! empty($data['ends_at']) ? $data['ends_at'] : null,
                'created_by_user_id' => $creator?->id,
            ]);

            // Save Tiers
            if (! empty($data['tiers']) && is_array($data['tiers'])) {
                foreach ($data['tiers'] as $tier) {
                    $minQty = (int) ($tier['min_quantity'] ?? 0);
                    $discVal = (float) ($tier['discount_value'] ?? 0);
                    if ($minQty > 0 && $discVal > 0) {
                        $rule->tiers()->create([
                            'min_quantity' => $minQty,
                            'max_quantity' => ! empty($tier['max_quantity']) ? (int) $tier['max_quantity'] : null,
                            'discount_type' => $tier['discount_type'] ?? 'fixed_price',
                            'discount_value' => $discVal,
                        ]);
                    }
                }
            }

            // Save Product / Group / Category targets
            if (! empty($data['products']) && is_array($data['products'])) {
                foreach ($data['products'] as $prod) {
                    $rule->ruleProducts()->create([
                        'product_id' => ! empty($prod['product_id']) ? (int) $prod['product_id'] : null,
                        'product_variant_id' => ! empty($prod['product_variant_id']) ? (int) $prod['product_variant_id'] : null,
                        'category_id' => ! empty($prod['category_id']) ? (int) $prod['category_id'] : null,
                        'wholesale_group_id' => ! empty($prod['wholesale_group_id']) ? (int) $prod['wholesale_group_id'] : null,
                        'is_excluded' => ! empty($prod['is_excluded']),
                    ]);
                }
            }

            // Save customer groups
            if (! empty($data['customer_group_ids']) && is_array($data['customer_group_ids'])) {
                $rule->customerGroups()->sync($data['customer_group_ids']);
            }

            // Audit
            WholesaleRuleAudit::query()->create([
                'wholesale_rule_id' => $rule->id,
                'user_id' => $creator?->id,
                'action' => 'created',
                'old_values' => null,
                'new_values' => $rule->load(['tiers', 'ruleProducts', 'customerGroups'])->toArray(),
                'description' => "Regra de atacado '{$rule->name}' criada.",
            ]);

            return $rule->load(['tiers', 'ruleProducts', 'customerGroups']);
        });
    }

    /**
     * Update an existing wholesale rule.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(WholesaleRule $rule, array $data, ?User $updater = null): WholesaleRule
    {
        return DB::transaction(function () use ($rule, $data, $updater) {
            $oldSnapshot = $rule->load(['tiers', 'ruleProducts', 'customerGroups'])->toArray();

            $updatePayload = [];
            foreach (['name', 'description', 'status', 'access_mode', 'quantity_scope', 'discount_policy', 'stacking_policy', 'min_quantity', 'priority', 'starts_at', 'ends_at'] as $field) {
                if (array_key_exists($field, $data)) {
                    $updatePayload[$field] = $data[$field];
                }
            }

            if (! empty($data['slug']) && $data['slug'] !== $rule->slug) {
                $slug = Str::slug((string) $data['slug']);
                if (WholesaleRule::query()->where('slug', $slug)->where('id', '!=', $rule->id)->exists()) {
                    $slug .= '-'.Str::lower(Str::random(5));
                }
                $updatePayload['slug'] = $slug;
            }

            $rule->update($updatePayload);

            // Update tiers if provided
            if (isset($data['tiers']) && is_array($data['tiers'])) {
                $rule->tiers()->delete();
                foreach ($data['tiers'] as $tier) {
                    $minQty = (int) ($tier['min_quantity'] ?? 0);
                    $discVal = (float) ($tier['discount_value'] ?? 0);
                    if ($minQty > 0 && $discVal > 0) {
                        $rule->tiers()->create([
                            'min_quantity' => $minQty,
                            'max_quantity' => ! empty($tier['max_quantity']) ? (int) $tier['max_quantity'] : null,
                            'discount_type' => $tier['discount_type'] ?? 'fixed_price',
                            'discount_value' => $discVal,
                        ]);
                    }
                }
            }

            // Update targets if provided
            if (isset($data['products']) && is_array($data['products'])) {
                $rule->ruleProducts()->delete();
                foreach ($data['products'] as $prod) {
                    $rule->ruleProducts()->create([
                        'product_id' => ! empty($prod['product_id']) ? (int) $prod['product_id'] : null,
                        'product_variant_id' => ! empty($prod['product_variant_id']) ? (int) $prod['product_variant_id'] : null,
                        'category_id' => ! empty($prod['category_id']) ? (int) $prod['category_id'] : null,
                        'wholesale_group_id' => ! empty($prod['wholesale_group_id']) ? (int) $prod['wholesale_group_id'] : null,
                        'is_excluded' => ! empty($prod['is_excluded']),
                    ]);
                }
            }

            // Update customer groups
            if (isset($data['customer_group_ids']) && is_array($data['customer_group_ids'])) {
                $rule->customerGroups()->sync($data['customer_group_ids']);
            }

            $newSnapshot = $rule->fresh(['tiers', 'ruleProducts', 'customerGroups'])->toArray();

            WholesaleRuleAudit::query()->create([
                'wholesale_rule_id' => $rule->id,
                'user_id' => $updater?->id,
                'action' => 'updated',
                'old_values' => $oldSnapshot,
                'new_values' => $newSnapshot,
                'description' => "Regra de atacado '{$rule->name}' atualizada.",
            ]);

            return $rule->fresh(['tiers', 'ruleProducts', 'customerGroups']);
        });
    }

    /**
     * Update the status of a wholesale rule (active, paused, ended, draft).
     */
    public function updateStatus(WholesaleRule $rule, string $status, ?User $updater = null): WholesaleRule
    {
        $validStatuses = ['draft', 'scheduled', 'active', 'paused', 'ended'];
        if (! in_array($status, $validStatuses, true)) {
            throw ValidationException::withMessages(['status' => ["Status inválido: {$status}"]]);
        }

        $oldStatus = $rule->status;
        $rule->update(['status' => $status]);

        WholesaleRuleAudit::query()->create([
            'wholesale_rule_id' => $rule->id,
            'user_id' => $updater?->id,
            'action' => 'status_changed',
            'old_values' => ['status' => $oldStatus],
            'new_values' => ['status' => $status],
            'description' => "Status da regra alterado de '{$oldStatus}' para '{$status}'.",
        ]);

        return $rule;
    }

    /**
     * Delete a rule.
     */
    public function delete(WholesaleRule $rule, ?User $deleter = null): bool
    {
        WholesaleRuleAudit::query()->create([
            'wholesale_rule_id' => $rule->id,
            'user_id' => $deleter?->id,
            'action' => 'deleted',
            'old_values' => $rule->load(['tiers', 'ruleProducts', 'customerGroups'])->toArray(),
            'new_values' => null,
            'description' => "Regra '{$rule->name}' excluída.",
        ]);

        return (bool) $rule->delete();
    }
}
