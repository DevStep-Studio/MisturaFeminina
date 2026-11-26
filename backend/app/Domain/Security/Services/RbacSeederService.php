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
            'orders' => ['orders.view', 'orders.manage', 'orders.refund', 'orders.cancel', 'orders.assisted', 'orders.occurrences', 'orders.cost.backfill'],
            'catalog' => ['catalog.view', 'catalog.write', 'catalog.pricing', 'catalog.bulk_edit', 'catalog.cost.view', 'catalog.cost.write', 'inventory.manage', 'inventory.receive'],
            'customers' => ['customers.view', 'customers.manage', 'lgpd.manage'],
            'content' => ['content.view', 'content.write', 'banners.write'],
            'marketing' => ['marketing.view', 'marketing.write', 'reviews.moderate'],
            'shipping' => ['shipping.view', 'shipping.write'],
            'payments' => ['payments.view', 'payments.manage', 'payments.reconcile'],
            'reports' => ['reports.view', 'reports.export', 'reports.profit.view', 'reports.profit.export'],
            'settings' => ['settings.view', 'settings.write', 'integrations.view', 'integrations.write'],
            'team' => ['team.view', 'team.manage'],
            'monitoring' => ['monitoring.view', 'audit.view'],
            'ai' => ['ai.view', 'ai.support', 'ai.catalog', 'ai.catalog.approve', 'ai.replenishment', 'ai.settings', 'ai.logs'],
            'wholesale' => ['wholesale.view', 'wholesale.manage', 'wholesale.pricing', 'wholesale.resellers', 'wholesale.reports'],
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
            RoleSlug::Catalog->value => ['name' => 'Catálogo e Estoque', 'permissions' => ['dashboard.view', 'catalog.view', 'catalog.write', 'catalog.pricing', 'catalog.bulk_edit', 'catalog.cost.view', 'catalog.cost.write', 'inventory.manage', 'inventory.receive', 'content.view', 'banners.write', 'ai.view', 'ai.catalog', 'ai.catalog.approve', 'ai.replenishment', 'wholesale.view', 'wholesale.pricing', 'wholesale.manage']],
            RoleSlug::Support->value => ['name' => 'Atendimento', 'permissions' => ['dashboard.view', 'orders.view', 'orders.assisted', 'orders.occurrences', 'customers.view', 'marketing.view', 'reviews.moderate', 'ai.view', 'ai.support', 'wholesale.view', 'wholesale.resellers']],
            RoleSlug::Fulfillment->value => ['name' => 'Expedição e Logística', 'permissions' => ['dashboard.view', 'orders.view', 'orders.manage', 'orders.occurrences', 'shipping.view', 'shipping.write', 'inventory.manage', 'inventory.receive', 'ai.view', 'ai.replenishment']],
            RoleSlug::Finance->value => ['name' => 'Financeiro', 'permissions' => ['dashboard.view', 'orders.view', 'orders.refund', 'orders.cancel', 'orders.cost.backfill', 'payments.view', 'payments.manage', 'payments.reconcile', 'catalog.cost.view', 'reports.view', 'reports.export', 'reports.profit.view', 'reports.profit.export', 'wholesale.view', 'wholesale.reports']],
            RoleSlug::Marketing->value => ['name' => 'Marketing e Conteúdo', 'permissions' => ['dashboard.view', 'content.view', 'content.write', 'banners.write', 'marketing.view', 'marketing.write', 'reviews.moderate', 'reports.view', 'ai.view']],
            RoleSlug::Customer->value => ['name' => 'Cliente', 'permissions' => []],
        ];

        foreach ($roleMap as $slug => $meta) {
            $role = Role::query()->updateOrCreate(['slug' => $slug], ['name' => $meta['name']]);
            $ids = array_values(array_filter(array_map(fn (string $p) => $allPermissions[$p] ?? null, $meta['permissions'])));
            $role->permissions()->sync($ids);
        }
    }
}
