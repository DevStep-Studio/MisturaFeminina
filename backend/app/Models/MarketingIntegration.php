<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $platform
 * @property string $name
 * @property string $status
 * @property string|null $account_id
 * @property string|null $account_name
 * @property string|null $property_id
 * @property string|null $pixel_id
 * @property array<string, mixed>|null $encrypted_credentials
 * @property array<string, mixed>|null $settings
 * @property CarbonInterface|null $last_synced_at
 * @property CarbonInterface|null $last_healthcheck_at
 * @property string|null $last_healthcheck_status
 * @property string|null $last_healthcheck_message
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'platform',
    'name',
    'status',
    'account_id',
    'account_name',
    'property_id',
    'pixel_id',
    'encrypted_credentials',
    'settings',
    'last_synced_at',
    'last_healthcheck_at',
    'last_healthcheck_status',
    'last_healthcheck_message',
])]
class MarketingIntegration extends Model
{
    protected function casts(): array
    {
        return [
            'encrypted_credentials' => 'array',
            'settings' => 'array',
            'last_synced_at' => 'datetime',
            'last_healthcheck_at' => 'datetime',
        ];
    }
}
