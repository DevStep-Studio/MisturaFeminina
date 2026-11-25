<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domain\Catalog\Services\CatalogBulkRuleService;
use App\Models\BulkEditBatch;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ProcessCatalogBulkRuleJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<string, mixed>  $selection
     * @param  array<string, mixed>  $rules
     * @param  array<string, mixed>  $previewSnapshot
     */
    public function __construct(
        public readonly int $batchId,
        public readonly array $selection,
        public readonly array $rules,
        public readonly int $actorId,
        public readonly array $previewSnapshot = [],
        public readonly bool $applyValidOnly = false,
        public readonly string $conflictResolution = 'abort',
    ) {}

    public function handle(CatalogBulkRuleService $service): void
    {
        /** @var BulkEditBatch|null $batch */
        $batch = BulkEditBatch::query()->find($this->batchId);
        /** @var User|null $actor */
        $actor = User::query()->find($this->actorId);

        if (! $batch || ! $actor) {
            return;
        }

        try {
            $preview = $service->previewRules($this->selection, $this->rules, $actor);
            $result = $service->executeCommit(
                $batch,
                $preview,
                $this->rules,
                $actor,
                $batch->idempotency_key,
                $this->previewSnapshot,
                $this->applyValidOnly,
                $this->conflictResolution,
            );

            if (($result['status'] ?? '') === 'conflict') {
                $batch->update([
                    'status' => 'conflict',
                    'error_message' => 'Conflito de concorrência detectado em '.count($result['conflicts'] ?? []).' item(ns). Revise os saldos atualizados.',
                    'summary' => array_merge($batch->summary ?? [], ['conflicts' => $result['conflicts'] ?? []]),
                ]);
            }
        } catch (Throwable $e) {
            $batch->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);
        }
    }
}
