<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, mixed>|null $config
 * @property int $sort_order
 * @property bool $is_active
 */
#[Fillable(['key', 'type', 'title', 'subtitle', 'config', 'sort_order', 'is_active'])]
class HomeSection extends Model
{
    protected function casts(): array
    {
        return [
            'config' => 'array',
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
