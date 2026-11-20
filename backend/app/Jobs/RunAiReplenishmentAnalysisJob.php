<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domain\AI\Services\InventoryReplenishmentAgent;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RunAiReplenishmentAnalysisJob implements ShouldQueue
{
    use Queueable;

    /** @param array<string, mixed> $params */
    public function __construct(
        private readonly ?int $userId = null,
        private readonly array $params = [],
        private readonly string $triggerType = 'scheduled',
    ) {}

    public function handle(InventoryReplenishmentAgent $agent): void
    {
        $actor = $this->userId ? User::query()->find($this->userId) : null;
        $agent->runAnalysis($actor, $this->params, $this->triggerType);
    }
}
