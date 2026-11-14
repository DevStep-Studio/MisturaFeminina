<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property CarbonInterface|null $consented_at
 * @property CarbonInterface|null $confirmed_at
 * @property CarbonInterface|null $unsubscribed_at
 * @property CarbonInterface|null $created_at
 */
#[Fillable(['email', 'name', 'consent_ip', 'consented_at', 'double_opt_in_token', 'confirmed_at', 'unsubscribe_token', 'unsubscribed_at'])]
class NewsletterSubscription extends Model
{
    protected function casts(): array
    {
        return [
            'consented_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'unsubscribed_at' => 'datetime',
        ];
    }
}
