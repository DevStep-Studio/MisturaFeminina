<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['session_id', 'user_id', 'order_id', 'event_name', 'path', 'utm_source', 'utm_medium', 'utm_campaign', 'payload'])]
class AnalyticsEvent extends Model
{
    protected function casts(): array
    {
        return ['payload' => 'array'];
    }
}
