<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int|null $audit_id
 * @property string $url
 * @property string $entity_type
 * @property int|null $entity_id
 * @property int $http_status
 * @property string|null $title
 * @property string|null $meta_description
 * @property string|null $canonical_url
 * @property bool $has_schema
 * @property array<string, mixed>|null $schema_types
 * @property int $score
 * @property array<string, mixed>|null $issues
 * @property string|null $suggested_title
 * @property string|null $suggested_description
 * @property string|null $optimization_reason
 * @property string $status
 * @property CarbonInterface|null $applied_at
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'audit_id',
    'url',
    'entity_type',
    'entity_id',
    'http_status',
    'title',
    'meta_description',
    'canonical_url',
    'has_schema',
    'schema_types',
    'score',
    'issues',
    'suggested_title',
    'suggested_description',
    'optimization_reason',
    'status',
    'applied_at',
])]
class SeoUrlInspection extends Model
{
    /** @return BelongsTo<SeoAudit, $this> */
    public function audit(): BelongsTo
    {
        return $this->belongsTo(SeoAudit::class, 'audit_id');
    }

    protected function casts(): array
    {
        return [
            'has_schema' => 'boolean',
            'schema_types' => 'array',
            'issues' => 'array',
            'http_status' => 'integer',
            'score' => 'integer',
            'applied_at' => 'datetime',
        ];
    }
}
