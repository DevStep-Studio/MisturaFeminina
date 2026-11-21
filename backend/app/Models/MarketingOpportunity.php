<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $title
 * @property string $category
 * @property string $priority
 * @property string $effort_level
 * @property string|null $estimated_lift
 * @property string $impact_description
 * @property string $status
 * @property array<string, mixed>|null $details
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'title',
    'category',
    'priority',
    'effort_level',
    'estimated_lift',
    'impact_description',
    'status',
    'details',
])]
class MarketingOpportunity extends Model
{
    protected function casts(): array
    {
        return [
            'details' => 'array',
        ];
    }
}
