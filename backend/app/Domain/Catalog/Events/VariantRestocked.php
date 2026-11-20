<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Events;

use App\Models\ProductVariant;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class VariantRestocked
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly ProductVariant $variant,
        public readonly int $previousAvailable,
        public readonly int $newAvailable,
        public readonly string $reason = 'Reposição de estoque',
    ) {}
}
