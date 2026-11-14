<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum RoleSlug: string
{
    case Superadmin = 'superadmin';
    case Admin = 'admin';
    case Catalog = 'catalog';
    case Support = 'support';
    case Fulfillment = 'fulfillment';
    case Finance = 'finance';
    case Marketing = 'marketing';
    case Customer = 'customer';
}
