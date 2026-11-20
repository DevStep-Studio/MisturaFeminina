<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $customer_group_id
 * @property int $user_id
 * @property string $status
 * @property string|null $company_name
 * @property string|null $trade_name
 * @property string|null $cnpj_cpf
 * @property string|null $state_registration
 * @property string|null $phone
 * @property CarbonInterface|null $requested_at
 * @property CarbonInterface|null $approved_at
 * @property int|null $approved_by_user_id
 * @property string|null $rejection_reason
 * @property string|null $notes
 */
#[Fillable([
    'customer_group_id',
    'user_id',
    'status',
    'company_name',
    'trade_name',
    'cnpj_cpf',
    'state_registration',
    'phone',
    'requested_at',
    'approved_at',
    'approved_by_user_id',
    'rejection_reason',
    'notes',
])]
class WholesaleCustomerGroupMember extends Model
{
    /** @return BelongsTo<WholesaleCustomerGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(WholesaleCustomerGroup::class, 'customer_group_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }
}
