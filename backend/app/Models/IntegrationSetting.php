<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, mixed>|null $encrypted_credentials
 * @property array<string, mixed>|null $public_config
 * @property bool $is_active
 * @property CarbonInterface|null $last_healthcheck_at
 */
#[Fillable(['provider', 'environment', 'encrypted_credentials', 'public_config', 'is_active', 'last_healthcheck_at', 'last_healthcheck_status'])]
#[Hidden(['encrypted_credentials'])]
class IntegrationSetting extends Model
{
    protected function casts(): array
    {
        return [
            'encrypted_credentials' => 'encrypted:array',
            'public_config' => 'array',
            'is_active' => 'boolean',
            'last_healthcheck_at' => 'datetime',
        ];
    }
}
