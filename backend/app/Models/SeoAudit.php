<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $status
 * @property int $overall_score
 * @property int $total_urls_crawled
 * @property int $healthy_urls_count
 * @property int $issues_count
 * @property int $warnings_count
 * @property array<string, mixed>|null $summary_payload
 * @property int|null $created_by_user_id
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'status',
    'overall_score',
    'total_urls_crawled',
    'healthy_urls_count',
    'issues_count',
    'warnings_count',
    'summary_payload',
    'created_by_user_id',
])]
class SeoAudit extends Model
{
    /** @return HasMany<SeoUrlInspection, $this> */
    public function inspections(): HasMany
    {
        return $this->hasMany(SeoUrlInspection::class, 'audit_id');
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'overall_score' => 'integer',
            'total_urls_crawled' => 'integer',
            'healthy_urls_count' => 'integer',
            'issues_count' => 'integer',
            'warnings_count' => 'integer',
            'summary_payload' => 'array',
        ];
    }
}
