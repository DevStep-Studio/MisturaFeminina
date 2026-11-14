<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['uploaded_by', 'title', 'disk', 'path', 'mime_type', 'size_bytes', 'width', 'height', 'alt_text', 'focal_point'])]
class MediaAsset extends Model
{
    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }
}
