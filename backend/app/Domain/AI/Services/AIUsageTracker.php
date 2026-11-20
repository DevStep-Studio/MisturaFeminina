<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Models\AiAgent;
use App\Models\AiExecution;
use App\Models\AiExecutionEvent;
use App\Models\AiProductImport;
use App\Models\AiReplenishmentAnalysis;
use App\Models\AiReplenishmentSuggestion;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class AIUsageTracker
{
    public function __construct(
        private readonly AIProviderService $provider,
    ) {}

    public function ensureAgentsSeeded(): void
    {
        $defs = [
            [
                'slug' => 'customer_support',
                'name' => 'Agente de Atendimento',
                'type' => 'support',
                'description' => 'Prepare respostas personalizadas utilizando os dados reais dos pedidos.',
                'model_name' => 'gpt-4o-mini',
            ],
            [
                'slug' => 'product_catalog',
                'name' => 'Agente de Cadastro',
                'type' => 'catalog',
                'description' => 'Transforme planilhas, fichas e documentos em produtos prontos para revisão.',
                'model_name' => 'gpt-4o-mini',
            ],
            [
                'slug' => 'inventory_replenishment',
                'name' => 'Agente de Reposição',
                'type' => 'replenishment',
                'description' => 'Analise vendas e estoques para descobrir o que precisa ser reposto.',
                'model_name' => 'gpt-4o-mini',
            ],
        ];

        foreach ($defs as $def) {
            AiAgent::query()->firstOrCreate(
                ['slug' => $def['slug']],
                [
                    'name' => $def['name'],
                    'type' => $def['type'],
                    'description' => $def['description'],
                    'enabled' => true,
                    'model_name' => $def['model_name'],
                    'version' => 1,
                ]
            );
        }
    }

    public function resolveAgent(string $slug): AiAgent
    {
        $this->ensureAgentsSeeded();

        return AiAgent::query()->where('slug', $slug)->firstOrFail();
    }

    public function assertCanRun(?User $user, AiAgent $agent): void
    {
        if (! $agent->enabled) {
            throw ValidationException::withMessages([
                'agent' => ["O agente {$agent->name} está desativado nas configurações de IA."],
            ]);
        }

        $cfg = $this->provider->getConfig();
        $today = now()->startOfDay();

        $dailyTotal = AiExecution::query()->where('created_at', '>=', $today)->count();
        if ($dailyTotal >= (int) $cfg['daily_execution_limit']) {
            throw ValidationException::withMessages([
                'quota' => ['Limite diário global de execuções de IA atingido.'],
            ]);
        }

        if ($user) {
            $userDaily = AiExecution::query()
                ->where('user_id', $user->id)
                ->where('created_at', '>=', $today)
                ->count();
            if ($userDaily >= (int) $cfg['daily_user_limit']) {
                throw ValidationException::withMessages([
                    'quota' => ['Seu limite diário de solicitações aos agentes de IA foi atingido.'],
                ]);
            }
        }

        $dailySpend = (float) AiExecution::query()->where('created_at', '>=', $today)->sum('estimated_cost_usd');
        if ($dailySpend >= (float) $cfg['daily_budget_usd']) {
            throw ValidationException::withMessages([
                'budget' => ['Orçamento diário configurado para o provedor de IA foi atingido.'],
            ]);
        }
    }

    /** @param array<string, mixed> $inputPayload */
    public function startExecution(
        AiAgent $agent,
        ?User $user,
        array $inputPayload = [],
        ?string $contextType = null,
        ?int $contextId = null,
        ?string $inputRef = null,
    ): AiExecution {
        $this->assertCanRun($user, $agent);
        $conn = $this->provider->connectionStatus();

        $execution = AiExecution::query()->create([
            'agent_id' => $agent->id,
            'user_id' => $user?->id,
            'status' => 'running',
            'execution_mode' => $conn['has_api_key'] ? 'llm_plus_tools' : 'deterministic_tools_only',
            'provider' => $conn['provider'],
            'model_name' => $agent->model_name,
            'context_type' => $contextType,
            'context_id' => $contextId,
            'input_reference' => $inputRef,
            'input_payload' => $inputPayload,
            'started_at' => now(),
        ]);

        $this->logEvent($execution, 'execution_started', null, "Execução iniciada para {$agent->name}.", [
            'user_id' => $user?->id,
            'context_type' => $contextType,
            'context_id' => $contextId,
        ]);

        return $execution;
    }

    /** @param array<string, mixed> $metadata */
    public function logEvent(
        AiExecution $execution,
        string $eventType,
        ?string $toolName,
        string $message,
        array $metadata = [],
    ): AiExecutionEvent {
        return AiExecutionEvent::query()->create([
            'execution_id' => $execution->id,
            'event_type' => $eventType,
            'tool_name' => $toolName,
            'message' => mb_substr($message, 0, 255),
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $outputPayload
     * @param  list<array<string, mixed>>  $toolCalls
     * @param  array<string, mixed>  $usage
     */
    public function finishExecution(
        AiExecution $execution,
        string $status,
        array $outputPayload,
        array $toolCalls = [],
        array $usage = [],
        ?string $resultRef = null,
        ?string $errorCode = null,
        ?string $errorMessage = null,
    ): AiExecution {
        $startedAt = $execution->started_at ?? now();
        $durationMs = (int) max(1, now()->diffInMilliseconds($startedAt, true));

        $execution->update([
            'status' => $status,
            'execution_mode' => ($usage['connected'] ?? false) && empty($usage['error'])
                ? 'llm_plus_tools'
                : 'deterministic_tools_only',
            'model_name' => $usage['model'] ?? $execution->model_name,
            'result_reference' => $resultRef,
            'output_payload' => $outputPayload,
            'tool_calls' => $toolCalls,
            'prompt_tokens' => (int) ($usage['prompt_tokens'] ?? 0),
            'completion_tokens' => (int) ($usage['completion_tokens'] ?? 0),
            'total_tokens' => (int) ($usage['total_tokens'] ?? 0),
            'estimated_cost_usd' => (float) ($usage['cost_usd'] ?? 0.0),
            'duration_ms' => $durationMs,
            'error_code' => $errorCode,
            'error_message' => $errorMessage,
            'finished_at' => now(),
        ]);

        $execution->agent()->update(['last_executed_at' => now()]);

        $this->logEvent(
            $execution,
            $status === 'failed' ? 'execution_failed' : 'execution_finished',
            null,
            $errorMessage ?: "Execução finalizada com status {$status}.",
            ['duration_ms' => $durationMs, 'total_tokens' => $execution->total_tokens]
        );

        return $execution->fresh() ?? $execution;
    }

    /** @return array<string, mixed> */
    public function overviewPayload(): array
    {
        $this->ensureAgentsSeeded();
        $conn = $this->provider->connectionStatus();
        $agents = AiAgent::query()
            ->withCount('executions')
            ->orderBy('id')
            ->get()
            ->map(function (AiAgent $a) use ($conn): array {
                return [
                    'id' => $a->id,
                    'slug' => $a->slug,
                    'name' => $a->name,
                    'type' => $a->type,
                    'description' => $a->description,
                    'enabled' => $a->enabled,
                    'model_name' => $a->model_name,
                    'version' => $a->version,
                    'executions_count' => (int) $a->getAttribute('executions_count'),
                    'last_executed_at' => $a->last_executed_at?->toIso8601String(),
                    'integration_status' => $conn['status'],
                    'integration_label' => $conn['label'],
                ];
            })->values()->all();

        $catalogAgentId = AiAgent::query()->where('slug', 'product_catalog')->value('id');
        $supportAgentId = AiAgent::query()->where('slug', 'customer_support')->value('id');

        $latestAnalysis = AiReplenishmentAnalysis::query()->latest('id')->first();

        $kpis = [
            'catalog_imports_prepared' => AiProductImport::query()->count(),
            'catalog_imports_awaiting_review' => AiProductImport::query()->where('status', 'awaiting_review')->count(),
            'support_replies_prepared' => $supportAgentId
                ? AiExecution::query()->where('agent_id', $supportAgentId)->where('status', 'completed')->count()
                : 0,
            'replenishment_recommendations_generated' => $latestAnalysis
                ? AiReplenishmentSuggestion::query()->where('analysis_id', $latestAnalysis->id)->where('suggested_quantity', '>', 0)->count()
                : 0,
            'failed_executions' => AiExecution::query()->where('status', 'failed')->count(),
            'tokens_today' => (int) AiExecution::query()->where('created_at', '>=', now()->startOfDay())->sum('total_tokens'),
            'cost_today_usd' => round((float) AiExecution::query()->where('created_at', '>=', now()->startOfDay())->sum('estimated_cost_usd'), 4),
            'catalog_executions_total' => $catalogAgentId
                ? AiExecution::query()->where('agent_id', $catalogAgentId)->count()
                : 0,
        ];

        $recentExecutions = AiExecution::query()
            ->with(['agent:id,slug,name,type', 'user:id,name'])
            ->latest('id')
            ->limit(25)
            ->get()
            ->map(fn (AiExecution $e): array => [
                'id' => $e->id,
                'agent_slug' => $e->agent->slug ?? '',
                'agent_name' => $e->agent->name ?? 'Agente',
                'user_name' => $e->user->name ?? 'Sistema / Agendado',
                'status' => $e->status,
                'execution_mode' => $e->execution_mode,
                'model_name' => $e->model_name,
                'input_reference' => $e->input_reference,
                'result_reference' => $e->result_reference,
                'total_tokens' => $e->total_tokens,
                'estimated_cost_usd' => $e->estimated_cost_usd,
                'duration_ms' => $e->duration_ms,
                'error_message' => $e->error_message,
                'started_at' => $e->started_at?->toIso8601String(),
                'finished_at' => $e->finished_at?->toIso8601String(),
            ])->values()->all();

        $pendingImports = AiProductImport::query()
            ->where('status', 'awaiting_review')
            ->with('user:id,name')
            ->latest('id')
            ->limit(15)
            ->get()
            ->map(fn (AiProductImport $imp): array => [
                'id' => $imp->id,
                'source_type' => $imp->source_type,
                'total_records' => $imp->total_records,
                'grouped_products_count' => $imp->grouped_products_count,
                'duplicate_count' => $imp->duplicate_count,
                'user_name' => $imp->user->name ?? '',
                'created_at' => $imp->created_at?->toIso8601String(),
            ])->values()->all();

        return [
            'provider' => $conn,
            'agents' => $agents,
            'kpis' => $kpis,
            'recent_executions' => $recentExecutions,
            'pending_imports' => $pendingImports,
        ];
    }
}
