<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum InventoryMovementType: string
{
    case In = 'in';
    case Adjustment = 'adjustment';
    case Reserve = 'reserve';
    case Release = 'release';
    case Deduct = 'deduct';
    case Refund = 'refund';
}
