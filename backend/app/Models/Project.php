<?php

namespace App\Models;

use App\Domain\Projects\Enums\ProjectStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property ProjectStatus $status */
class Project extends Model
{
    protected $fillable = ['name', 'description', 'status'];

    protected function casts(): array
    {
        return ['status' => ProjectStatus::class];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
