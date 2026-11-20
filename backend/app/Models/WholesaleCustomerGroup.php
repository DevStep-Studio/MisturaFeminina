<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['slug', 'name', 'description', 'status'])]
class WholesaleCustomerGroup extends Model
{
    /** @return HasMany<WholesaleCustomerGroupMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(WholesaleCustomerGroupMember::class, 'customer_group_id');
    }

    /** @return BelongsToMany<User, $this> */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'wholesale_customer_group_members', 'customer_group_id', 'user_id')
            ->withPivot(['status', 'company_name', 'trade_name', 'cnpj_cpf', 'state_registration', 'phone', 'requested_at', 'approved_at', 'approved_by_user_id', 'rejection_reason', 'notes'])
            ->withTimestamps();
    }

    /** @return BelongsToMany<WholesaleRule, $this> */
    public function rules(): BelongsToMany
    {
        return $this->belongsToMany(WholesaleRule::class, 'wholesale_rule_customer_groups', 'customer_group_id', 'wholesale_rule_id')
            ->withTimestamps();
    }
}
