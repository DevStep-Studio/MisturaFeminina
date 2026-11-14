<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'cpf_cnpj' => $this->cpf_cnpj,
            'roles' => $this->roleSlugs(),
            'permissions' => $this->permissionSlugs(),
            'workspace_id' => null,
            'is_staff' => $this->isStaff(),
            'must_reset_password' => (bool) $this->must_reset_password,
            'two_factor_enabled' => $this->two_factor_confirmed_at !== null,
        ];
    }
}
