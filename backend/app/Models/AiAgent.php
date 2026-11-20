<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $slug
 * @property string $name
 * @property string $type
 * @property string|null $description
 * @property bool $enabled
 * @property string $model_name
 * @property string|null $system_prompt
 * @property array<string, mixed>|null $configuration
 * @property int $version
 * @property CarbonInterface|null $last_executed_at
 */
#[Fillable(['slug', 'name', 'type', 'description', 'enabled', 'model_name', 'system_prompt', 'configuration', 'version', 'last_executed_at'])]
class AiAgent extends Model
{
    /** @return HasMany<AiExecution, $this> */
    public function executions(): HasMany
    {
        return $this->hasMany(AiExecution::class, 'agent_id');
    }

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'configuration' => 'array',
            'version' => 'integer',
            'last_executed_at' => 'datetime',
        ];
    }
}
