<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string|null $document
 * @property string|null $contact_name
 * @property string|null $email
 * @property string|null $phone
 * @property string|null $notes
 * @property bool $is_active
 */
#[Fillable(['name', 'document', 'contact_name', 'email', 'phone', 'notes', 'is_active'])]
class Supplier extends Model
{
    /** @return HasMany<GoodsReceipt, $this> */
    public function receipts(): HasMany
    {
        return $this->hasMany(GoodsReceipt::class);
    }

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
