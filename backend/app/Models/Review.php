<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'product_id',
    'user_id',
    'author_name',
    'author_email',
    'rating',
    'title',
    'body',
    'photos',
    'is_verified_purchase',
    'is_external',
    'source_name',
    'source_url',
    'variant_name',
    'status',
    'admin_notes',
])]
class Review extends Model
{
    /** @var list<string> */
    protected $hidden = [
        'author_email',
        'user_id',
    ];

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    protected function casts(): array
    {
        return [
            'rating' => 'integer',
            'is_verified_purchase' => 'boolean',
            'is_external' => 'boolean',
            'photos' => 'array',
        ];
    }
}
