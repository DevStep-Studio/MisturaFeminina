<?php

declare(strict_types=1);

namespace App\Domain\Security\Services;

use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Permission;
use App\Models\Role;

class RbacSeederService
{
    /** @return array<string, list<string>> */
    public static function permissionDefinitions(): array
    {
        return [
            'dashboard' => ['dashboard.view'],
            'orders' => ['orders.view', 'orders.manage', 'orders.refund', 'orders.cancel'],
            'catalog' => ['catalog.view', 'catalog.write', 'inventory.manage'],
            'customers' => ['customers.view', 'customers.manage', 'lgpd.manage'],
            'content' => ['content.view', 'content.write', 'banners.write'],
            'marketing' => ['marketing.view', 'marketing.write', 'reviews.moderate'],
            'shipping' => ['shipping.view', 'shipping.write'],
            'payments' => ['payments.view', 'payments.manage', 'payments.reconcile'],
            'reports' => ['reports.view', 'reports.export'],
            'settings' => ['settings.view', 'settings.write', 'integrations.view', 'integrations.write'],
            'team' => ['team.view', 'team.manage'],
            'monitoring' => ['monitoring.view', 'audit.view'],
        ];
    }

    public function syncRolesAndPermissions(): void
    {
        $allPermissions = [];
        foreach (self::permissionDefinitions() as $module => $slugs) {
            foreach ($slugs as $slug) {
                $permission = Permission::query()->updateOrCreate(
                    ['slug' => $slug],
                    ['module' => $module, 'name' => ucfirst(str_replace('.', ' ', $slug))]
                );
                $allPermissions[$slug] = $permission->id;
            }
        }

        $roleMap = [
            RoleSlug::Superadmin->value => ['name' => 'Superadministrador', 'permissions' => array_keys($allPermissions)],
            RoleSlug::Admin->value => ['name' => 'Administrador', 'permissions' => array_keys($allPermissions)],
            RoleSlug::Catalog->value => ['name' => 'Catálogo e Estoque', 'permissions' => ['dashboard.view', 'catalog.view', 'catalog.write', 'inventory.manage', 'content.view', 'banners.write']],
            RoleSlug::Support->value => ['name' => 'Atendimento', 'permissions' => ['dashboard.view', 'orders.view', 'customers.view', 'marketing.view', 'reviews.moderate']],
            RoleSlug::Fulfillment->value => ['name' => 'Expedição e Logística', 'permissions' => ['dashboard.view', 'orders.view', 'orders.manage', 'shipping.view', 'shipping.write', 'inventory.manage']],
            RoleSlug::Finance->value => ['name' => 'Financeiro', 'permissions' => ['dashboard.view', 'orders.view', 'orders.refund', 'orders.cancel', 'payments.view', 'payments.manage', 'payments.reconcile', 'reports.view', 'reports.export']],
            RoleSlug::Marketing->value => ['name' => 'Marketing e Conteúdo', 'permissions' => ['dashboard.view', 'content.view', 'content.write', 'banners.write', 'marketing.view', 'marketing.write', 'reviews.moderate', 'reports.view']],
            RoleSlug::Customer->value => ['name' => 'Cliente', 'permissions' => []],
        ];

        foreach ($roleMap as $slug => $meta) {
            $role = Role::query()->updateOrCreate(['slug' => $slug], ['name' => $meta['name']]);
            $ids = array_values(array_filter(array_map(fn (string $p) => $allPermissions[$p] ?? null, $meta['permissions'])));
            $role->permissions()->sync($ids);
        }
    }
}
