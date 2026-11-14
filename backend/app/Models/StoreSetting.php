<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, mixed>|null $value
 * @property bool $is_public
 */
#[Fillable(['key', 'group', 'value', 'is_public'])]
class StoreSetting extends Model
{
    protected function casts(): array
    {
        return [
            'value' => 'array',
            'is_public' => 'boolean',
        ];
    }
}
