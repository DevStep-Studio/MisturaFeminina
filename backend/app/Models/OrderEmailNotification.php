<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['order_id', 'event_key', 'recipient', 'payload', 'status', 'attempts', 'last_attempt_at', 'sent_at', 'last_error'])]
class OrderEmailNotification extends Model
{
    protected function casts(): array
    {
        return ['payload' => 'array', 'attempts' => 'integer', 'last_attempt_at' => 'datetime', 'sent_at' => 'datetime'];
    }
}
