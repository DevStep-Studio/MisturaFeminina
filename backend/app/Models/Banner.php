<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['title', 'placement', 'desktop_image_path', 'mobile_image_path', 'alt_text', 'cta_label', 'cta_url', 'sort_order', 'is_active', 'starts_at', 'ends_at'])]
class Banner extends Model
{
    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }
}
