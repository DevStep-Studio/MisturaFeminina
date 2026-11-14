<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'birth_date', 'newsletter_opt_in', 'newsletter_opt_in_at', 'whatsapp_opt_in', 'wholesale_approved', 'notes'])]
class CustomerProfile extends Model
{
    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'newsletter_opt_in' => 'boolean',
            'newsletter_opt_in_at' => 'datetime',
            'whatsapp_opt_in' => 'boolean',
            'wholesale_approved' => 'boolean',
        ];
    }
}
