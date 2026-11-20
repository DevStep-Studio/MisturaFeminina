<?php

declare(strict_types=1);

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use Carbon\CarbonInterface;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * @property bool $is_active
 * @property bool $must_reset_password
 * @property string|null $two_factor_secret
 * @property array<int, string>|null $two_factor_recovery_codes
 * @property CarbonInterface|null $two_factor_confirmed_at
 * @property CarbonInterface|null $last_login_at
 */
#[Fillable(['name', 'email', 'phone', 'cpf_cnpj', 'password', 'is_active', 'must_reset_password', 'last_login_at'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    /** @return HasMany<Project, $this> */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /** @return BelongsToMany<Role, $this> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    /** @return HasOne<CustomerProfile, $this> */
    public function customerProfile(): HasOne
    {
        return $this->hasOne(CustomerProfile::class);
    }

    /** @return HasMany<Address, $this> */
    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class);
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /** @return HasMany<Wishlist, $this> */
    public function wishlists(): HasMany
    {
        return $this->hasMany(Wishlist::class);
    }

    /** @return HasMany<ReplenishmentList, $this> */
    public function replenishmentLists(): HasMany
    {
        return $this->hasMany(ReplenishmentList::class);
    }

    /** @return list<string> */
    public function roleSlugs(): array
    {
        return $this->roles->pluck('slug')->values()->all();
    }

    /** @return list<string> */
    public function permissionSlugs(): array
    {
        $base = ['projects.view', 'projects.create', 'projects.update', 'projects.delete'];
        if ($this->roles->isEmpty()) {
            return $base;
        }

        if ($this->roles->contains('slug', 'superadmin')) {
            return array_values(array_unique(array_merge($base, Permission::query()->pluck('slug')->all())));
        }

        $rolePermissions = $this->roles()
            ->with('permissions:id,slug')
            ->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('slug'))
            ->unique()
            ->values()
            ->all();

        return array_values(array_unique(array_merge($base, $rolePermissions)));
    }

    public function hasRole(string ...$slugs): bool
    {
        $this->loadMissing('roles:id,slug');

        return $this->roles->whereIn('slug', $slugs)->isNotEmpty();
    }

    public function hasPermission(string $permission): bool
    {
        $this->loadMissing('roles.permissions:id,slug');
        if ($this->roles->contains('slug', 'superadmin')) {
            return true;
        }

        return in_array($permission, $this->permissionSlugs(), true);
    }

    public function isStaff(): bool
    {
        $this->loadMissing('roles:id,slug');

        return $this->roles->whereNotIn('slug', ['customer'])->isNotEmpty();
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_reset_password' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }
}
