<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $raw_term
 * @property string $normalized_term
 * @property int $results_count
 * @property string|null $category_slug
 * @property string|null $session_id
 * @property int|null $user_id
 */
#[Fillable(['raw_term', 'normalized_term', 'results_count', 'category_slug', 'session_id', 'user_id'])]
class SearchQueryLog extends Model
{
    protected function casts(): array
    {
        return [
            'results_count' => 'integer',
            'user_id' => 'integer',
        ];
    }
}
