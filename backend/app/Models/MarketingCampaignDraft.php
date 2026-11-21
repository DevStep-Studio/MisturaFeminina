<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $platform
 * @property string $campaign_name
 * @property string $campaign_type
 * @property int $daily_budget_cents
 * @property float|null $target_roas
 * @property array<string, mixed>|null $targeting
 * @property array<string, mixed>|null $ad_groups
 * @property array<string, mixed>|null $creative_assets
 * @property string $status
 * @property string|null $approval_notes
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'platform',
    'campaign_name',
    'campaign_type',
    'daily_budget_cents',
    'target_roas',
    'targeting',
    'ad_groups',
    'creative_assets',
    'status',
    'approval_notes',
])]
class MarketingCampaignDraft extends Model
{
    protected function casts(): array
    {
        return [
            'daily_budget_cents' => 'integer',
            'target_roas' => 'float',
            'targeting' => 'array',
            'ad_groups' => 'array',
            'creative_assets' => 'array',
        ];
    }
}
