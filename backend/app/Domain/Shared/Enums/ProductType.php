<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum ProductType: string
{
    case Simple = 'simple';
    case Variable = 'variable';
    case Kit = 'kit';
}
