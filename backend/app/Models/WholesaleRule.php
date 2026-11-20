<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string $status
 * @property string $access_mode
 * @property string $quantity_scope
 * @property string $discount_policy
 * @property string $stacking_policy
 * @property int $min_quantity
 * @property int $priority
 * @property CarbonInterface|null $starts_at
 * @property CarbonInterface|null $ends_at
 * @property int|null $created_by_user_id
 */
#[Fillable([
    'name',
    'slug',
    'description',
    'status',
    'access_mode',
    'quantity_scope',
    'discount_policy',
    'stacking_policy',
    'min_quantity',
    'priority',
    'starts_at',
    'ends_at',
    'created_by_user_id',
])]
class WholesaleRule extends Model
{
    /** @return HasMany<WholesaleRuleTier, $this> */
    public function tiers(): HasMany
    {
        return $this->hasMany(WholesaleRuleTier::class, 'wholesale_rule_id')->orderBy('min_quantity');
    }

    /** @return HasMany<WholesaleRuleProduct, $this> */
    public function ruleProducts(): HasMany
    {
        return $this->hasMany(WholesaleRuleProduct::class, 'wholesale_rule_id');
    }

    /** @return BelongsToMany<WholesaleCustomerGroup, $this> */
    public function customerGroups(): BelongsToMany
    {
        return $this->belongsToMany(WholesaleCustomerGroup::class, 'wholesale_rule_customer_groups', 'wholesale_rule_id', 'customer_group_id')
            ->withTimestamps();
    }

    /** @return HasMany<WholesaleRuleAudit, $this> */
    public function audits(): HasMany
    {
        return $this->hasMany(WholesaleRuleAudit::class, 'wholesale_rule_id')->latest();
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'min_quantity' => 'integer',
            'priority' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function isActiveNow(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        $now = now();

        if ($this->starts_at !== null && $this->starts_at->isAfter($now)) {
            return false;
        }

        if ($this->ends_at !== null && $this->ends_at->isBefore($now)) {
            return false;
        }

        return true;
    }
}
