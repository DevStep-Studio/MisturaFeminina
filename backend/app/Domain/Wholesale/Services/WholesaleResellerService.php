<?php

declare(strict_types=1);

namespace App\Domain\Wholesale\Services;

use App\Models\User;
use App\Models\WholesaleCustomerGroup;
use App\Models\WholesaleCustomerGroupMember;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WholesaleResellerService
{
    /**
     * Request a wholesale / reseller account.
     *
     * @param  array<string, mixed>  $data
     */
    public function requestRegistration(array $data, ?User $currentUser = null): WholesaleCustomerGroupMember
    {
        $defaultGroup = WholesaleCustomerGroup::query()->firstOrCreate(
            ['slug' => 'revendedores-aprovados'],
            [
                'name' => 'Revendedores Aprovados',
                'description' => 'Grupo padrão de clientes revendedores com acesso a preços e condições de atacado exclusivas.',
                'status' => 'active',
            ]
        );

        $targetUser = $currentUser;
        if (! $targetUser) {
            $email = strtolower(trim((string) ($data['email'] ?? '')));
            if ($email === '') {
                throw ValidationException::withMessages(['email' => ['E-mail é obrigatório.']]);
            }

            $targetUser = User::query()->where('email', $email)->first();
            if (! $targetUser) {
                $targetUser = User::query()->create([
                    'name' => (string) ($data['name'] ?? $data['company_name'] ?? 'Cliente Atacado'),
                    'email' => $email,
                    'phone' => $data['phone'] ?? null,
                    'cpf_cnpj' => $data['cnpj_cpf'] ?? null,
                    'password' => Hash::make(Str::random(16)),
                    'is_active' => true,
                ]);
            }
        }

        /** @var WholesaleCustomerGroupMember $member */
        $member = WholesaleCustomerGroupMember::query()->updateOrCreate(
            [
                'customer_group_id' => $defaultGroup->id,
                'user_id' => $targetUser->id,
            ],
            [
                'status' => 'pending',
                'company_name' => $data['company_name'] ?? null,
                'trade_name' => $data['trade_name'] ?? null,
                'cnpj_cpf' => $data['cnpj_cpf'] ?? $targetUser->cpf_cnpj,
                'state_registration' => $data['state_registration'] ?? null,
                'phone' => $data['phone'] ?? $targetUser->phone,
                'requested_at' => now(),
                'notes' => $data['notes'] ?? null,
            ]
        );

        return $member->load(['group', 'user']);
    }

    /**
     * List reseller memberships.
     *
     * @param  array<string, mixed>  $filters
     */
    public function listMembers(array $filters = []): LengthAwarePaginator
    {
        $query = WholesaleCustomerGroupMember::query()
            ->with(['group', 'user', 'approvedBy']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['group_id'])) {
            $query->where('customer_group_id', (int) $filters['group_id']);
        }

        if (! empty($filters['search'])) {
            $s = trim((string) $filters['search']);
            $query->where(function ($q) use ($s): void {
                $q->where('company_name', 'like', "%{$s}%")
                    ->orWhere('trade_name', 'like', "%{$s}%")
                    ->orWhere('cnpj_cpf', 'like', "%{$s}%")
                    ->orWhereHas('user', fn ($uq) => $uq->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%"));
            });
        }

        return $query->orderByDesc('requested_at')->orderByDesc('id')->paginate((int) ($filters['per_page'] ?? 15));
    }

    /**
     * Approve a reseller application.
     */
    public function approve(WholesaleCustomerGroupMember $member, User $approver, ?int $groupId = null): WholesaleCustomerGroupMember
    {
        $update = [
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by_user_id' => $approver->id,
            'rejection_reason' => null,
        ];

        if ($groupId !== null) {
            $update['customer_group_id'] = $groupId;
        }

        $member->update($update);

        return $member->fresh(['group', 'user', 'approvedBy']);
    }

    /**
     * Reject a reseller application.
     */
    public function reject(WholesaleCustomerGroupMember $member, User $approver, string $reason): WholesaleCustomerGroupMember
    {
        $member->update([
            'status' => 'rejected',
            'approved_at' => null,
            'approved_by_user_id' => $approver->id,
            'rejection_reason' => $reason,
        ]);

        return $member->fresh(['group', 'user', 'approvedBy']);
    }

    /**
     * Suspend an approved reseller.
     */
    public function suspend(WholesaleCustomerGroupMember $member, User $approver, ?string $reason = null): WholesaleCustomerGroupMember
    {
        $member->update([
            'status' => 'suspended',
            'rejection_reason' => $reason,
            'approved_by_user_id' => $approver->id,
        ]);

        return $member->fresh(['group', 'user', 'approvedBy']);
    }

    /**
     * Reactivate a suspended or rejected reseller.
     */
    public function reactivate(WholesaleCustomerGroupMember $member, User $approver): WholesaleCustomerGroupMember
    {
        $member->update([
            'status' => 'approved',
            'rejection_reason' => null,
            'approved_at' => now(),
            'approved_by_user_id' => $approver->id,
        ]);

        return $member->fresh(['group', 'user', 'approvedBy']);
    }
}
