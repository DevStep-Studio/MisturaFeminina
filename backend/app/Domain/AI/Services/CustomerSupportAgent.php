<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Models\Order;
use App\Models\User;

class CustomerSupportAgent
{
    public function __construct(
        private readonly AIProviderService $provider,
        private readonly AIUsageTracker $tracker,
        private readonly AIToolRegistry $tools,
        private readonly PromptInjectionGuard $guard,
    ) {}

    /**
     * Prepares a factual customer reply grounded strictly in real order, payment, shipping and occurrence tools.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function prepareOrderReply(Order $order, User $actor, array $options = []): array
    {
        $agent = $this->tracker->resolveAgent('customer_support');
        $rawInstruction = trim((string) ($options['instruction'] ?? 'Prepare uma resposta informando a situação atual do pedido.'));
        $rawTone = $options['tone_length'] ?? 'normal';
        $toneLength = is_string($rawTone) && in_array($rawTone, ['short', 'normal', 'detailed'], true)
            ? $rawTone
            : 'normal';

        $guardResult = $this->guard->inspect($rawInstruction, 'support_instruction');
        $instruction = $guardResult['cleaned_text'];

        $execution = $this->tracker->startExecution(
            $agent,
            $actor,
            ['order_id' => $order->id, 'instruction' => $instruction, 'tone_length' => $toneLength],
            'order',
            $order->id,
            $order->order_number
        );

        if ($guardResult['has_injection']) {
            $this->tracker->logEvent($execution, 'prompt_injection_blocked', null, 'Instrução suspeita neutralizada no Agente de Atendimento.', [
                'patterns' => $guardResult['matched_patterns'],
            ]);
        }

        $toolCalls = [];
        $details = $this->tools->callTool('get_order_details', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_order_details';
        $payment = $this->tools->callTool('get_payment_status', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_payment_status';
        $shipping = $this->tools->callTool('get_shipping_status', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_shipping_status';
        $tracking = $this->tools->callTool('get_tracking_information', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_tracking_information';
        $occurrences = $this->tools->callTool('get_order_occurrences', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_order_occurrences';
        $timeline = $this->tools->callTool('get_order_timeline', ['order_id' => $order->id], $actor, $execution);
        $toolCalls[] = 'get_order_timeline';

        $facts = [
            'order_number' => $order->order_number,
            'customer_first_name' => explode(' ', trim((string) $order->customer_name))[0] ?: 'cliente',
            'order_status' => $details['status'],
            'is_confirmed_paid' => (bool) $payment['is_confirmed_paid'],
            'payment_method' => $payment['latest_payment']['method'] ?? null,
            'payment_status' => $payment['latest_payment']['status'] ?? null,
            'carrier' => $tracking['carrier'],
            'has_tracking' => (bool) $tracking['has_tracking'],
            'tracking_code' => $tracking['tracking_code'],
            'tracking_url' => $tracking['tracking_url'],
            'shipping_deadline_at' => $shipping['shipping_deadline_at'],
            'is_delayed' => (bool) $shipping['is_delayed'],
            'shipped_at' => $shipping['shipped_at'],
            'delivered_at' => $shipping['delivered_at'],
            'has_issue' => (bool) $occurrences['has_issue'],
            'issue_reason' => $occurrences['issue_reason'],
            'open_occurrences_count' => count(array_filter(
                $occurrences['occurrences'],
                fn (array $o): bool => ! in_array($o['status'], ['resolved', 'closed'], true)
            )),
            'items_count' => count($details['items']),
            'items_summary' => array_map(
                fn (array $i): string => "{$i['quantity']}x {$i['product_name']} ({$i['variant_name']})",
                $details['items']
            ),
            'timeline_events_count' => count($timeline['events']),
        ];

        $warnings = $this->computeOperationalWarnings($facts);
        $deterministicDraft = $this->composeGroundedReply($facts, $instruction, $toneLength);

        $llmUsage = ['connected' => false];
        $finalReply = $deterministicDraft;
        $conn = $this->provider->connectionStatus();

        if ($conn['has_api_key']) {
            $llmResult = $this->provider->chatStructured(
                'support',
                'Você é o Assistente de Atendimento da loja Mistura Feminina Cosméticos. '
                .'Responda em português do Brasil com tom educado, acolhedor, natural e objetivo. '
                .'REGRA CRÍTICA: baseie-se EXCLUSIVAMENTE nos fatos JSON fornecidos. '
                .'NUNCA invente código de rastreio, transportadora, previsão de entrega ou prazo de postagem ausentes. '
                .'NUNCA diga que o pagamento foi aprovado se is_confirmed_paid for false. '
                .'NUNCA diga que o pedido foi entregue se delivered_at for null.',
                json_encode([
                    'instrucao_atendente' => $instruction,
                    'tamanho_desejado' => $toneLength,
                    'fatos_reais_do_pedido' => $facts,
                    'alertas_internos' => $warnings,
                    'rascunho_base' => $deterministicDraft,
                ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['reply_text', 'confidence_note'],
                    'properties' => [
                        'reply_text' => ['type' => 'string'],
                        'confidence_note' => ['type' => 'string'],
                    ],
                ]
            );

            $llmUsage = $llmResult;
            $candidate = is_array($llmResult['content'] ?? null) ? trim((string) ($llmResult['content']['reply_text'] ?? '')) : '';
            if ($candidate !== '' && $this->passesFactualGuardrails($candidate, $facts)) {
                $finalReply = $candidate;
            }
        }

        if (! empty($options['save_internal_note'])) {
            $this->tools->callTool('save_internal_note', [
                'order_id' => $order->id,
                'note_type' => 'customer_contact',
                'body' => "[Resposta preparada por IA] {$finalReply}",
            ], $actor, $execution);
            $toolCalls[] = 'save_internal_note';
        }

        $whatsappUrl = $this->buildWhatsappUrl($order->customer_phone, $finalReply);

        $output = [
            'reply_text' => $finalReply,
            'tone_length' => $toneLength,
            'facts_used' => $facts,
            'warnings' => $warnings,
            'whatsapp_url' => $whatsappUrl,
            'execution_id' => $execution->id,
            'execution_mode' => (! empty($llmUsage['connected']) && empty($llmUsage['error'])) ? 'llm_plus_tools' : 'deterministic_tools_only',
            'provider_status' => $conn['status'],
            'provider_label' => $conn['label'],
        ];

        $this->tracker->finishExecution(
            $execution,
            'completed',
            $output,
            array_map(fn (string $t): array => ['tool' => $t], $toolCalls),
            $llmUsage,
            $order->order_number
        );

        return $output;
    }

    /** @return array<string, mixed> */
    public function summarizeOrderHistory(Order $order, User $actor): array
    {
        $agent = $this->tracker->resolveAgent('customer_support');
        $execution = $this->tracker->startExecution($agent, $actor, ['action' => 'summarize_history', 'order_id' => $order->id], 'order', $order->id, $order->order_number);

        $details = $this->tools->callTool('get_order_details', ['order_id' => $order->id], $actor, $execution);
        $payment = $this->tools->callTool('get_payment_status', ['order_id' => $order->id], $actor, $execution);
        $shipping = $this->tools->callTool('get_shipping_status', ['order_id' => $order->id], $actor, $execution);
        $occurrences = $this->tools->callTool('get_order_occurrences', ['order_id' => $order->id], $actor, $execution);
        $timeline = $this->tools->callTool('get_order_timeline', ['order_id' => $order->id], $actor, $execution);

        $bullets = [
            "Pedido {$order->order_number} em status operacional '{$details['status']}' com ".count($details['items']).' item(ns).',
            $payment['is_confirmed_paid']
                ? 'Pagamento confirmado.'
                : 'Pagamento ainda não confirmado (status: '.($payment['latest_payment']['status'] ?? 'pendente').').',
            ! empty($shipping['shipped_at'])
                ? 'Pedido já expedido'.(! empty($shipping['carrier']) ? " via {$shipping['carrier']}" : '').'.'
                : ($shipping['is_delayed'] ? 'Atenção: prazo de postagem registrado já expirou e ainda não consta envio.' : 'Ainda não enviado / aguardando expedição.'),
        ];

        if (count($occurrences['occurrences']) > 0) {
            $bullets[] = 'Ocorrências registradas: '.count($occurrences['occurrences']).'.';
        }
        $bullets[] = 'Total de marcos na linha do tempo: '.count($timeline['events']).'.';

        $output = [
            'summary_bullets' => $bullets,
            'timeline_count' => count($timeline['events']),
            'execution_id' => $execution->id,
        ];

        $this->tracker->finishExecution($execution, 'completed', $output, [
            ['tool' => 'get_order_details'],
            ['tool' => 'get_payment_status'],
            ['tool' => 'get_shipping_status'],
            ['tool' => 'get_order_occurrences'],
            ['tool' => 'get_order_timeline'],
        ], [], $order->order_number);

        return $output;
    }

    /** @return array<string, mixed> */
    public function analyzeOccurrences(Order $order, User $actor): array
    {
        $agent = $this->tracker->resolveAgent('customer_support');
        $execution = $this->tracker->startExecution($agent, $actor, ['action' => 'analyze_occurrences', 'order_id' => $order->id], 'order', $order->id, $order->order_number);

        $occurrences = $this->tools->callTool('get_order_occurrences', ['order_id' => $order->id], $actor, $execution);
        $shipping = $this->tools->callTool('get_shipping_status', ['order_id' => $order->id], $actor, $execution);

        $openList = array_values(array_filter(
            $occurrences['occurrences'],
            fn (array $o): bool => ! in_array($o['status'], ['resolved', 'closed'], true)
        ));

        $analysis = [];
        if ($openList === [] && ! $occurrences['has_issue'] && ! $shipping['is_delayed']) {
            $analysis[] = 'Nenhuma ocorrência em aberto ou atraso identificado neste pedido no momento.';
        } else {
            if ($shipping['is_delayed']) {
                $analysis[] = 'O prazo de postagem registrado expirou antes da confirmação de envio.';
            }
            if ($occurrences['has_issue'] && $occurrences['issue_reason']) {
                $analysis[] = "Sinalização de problema ativo: {$occurrences['issue_reason']}.";
            }
            foreach ($openList as $occ) {
                $analysis[] = "Ocorrência {$occ['occurrence_number']} ({$occ['type']}, status {$occ['status']}): {$occ['description']}";
            }
        }

        $output = [
            'findings' => $analysis,
            'open_occurrences_count' => count($openList),
            'execution_id' => $execution->id,
        ];

        $this->tracker->finishExecution($execution, 'completed', $output, [
            ['tool' => 'get_order_occurrences'],
            ['tool' => 'get_shipping_status'],
        ], [], $order->order_number);

        return $output;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return list<string>
     */
    private function computeOperationalWarnings(array $facts): array
    {
        $warnings = [];
        if (! $facts['is_confirmed_paid'] && ! in_array($facts['order_status'], ['cancelled', 'expired'], true)) {
            $warnings[] = 'Pagamento ainda não confirmado — não prometer envio imediato nem informar aprovação.';
        }
        if ($facts['is_delayed']) {
            $warnings[] = 'Prazo de postagem registrado expirado: conferir fila de expedição antes de responder.';
        }
        if (! $facts['has_tracking']) {
            $warnings[] = 'Pedido sem código de rastreio registrado: não inventar código nem previsão de entrega.';
        }
        if ($facts['open_occurrences_count'] > 0 || $facts['has_issue']) {
            $warnings[] = 'Há ocorrência ou problema em aberto no pedido; verificar detalhes com o setor responsável.';
        }

        return $warnings;
    }

    /** @param array<string, mixed> $facts */
    private function composeGroundedReply(array $facts, string $instruction, string $toneLength): string
    {
        $firstName = (string) $facts['customer_first_name'];
        $orderNumber = (string) $facts['order_number'];
        $status = (string) $facts['order_status'];
        $lowerInstr = mb_strtolower($instruction);
        $isExchangeContext = str_contains($lowerInstr, 'troca') || str_contains($lowerInstr, 'devol');
        $isDelayContext = str_contains($lowerInstr, 'atras') || (bool) $facts['is_delayed'];

        $greeting = "Olá, {$firstName}! Tudo bem?";

        if ($status === 'cancelled' || $status === 'expired') {
            return $toneLength === 'short'
                ? "{$greeting} Verificamos o pedido {$orderNumber} e ele encontra-se cancelado/expirado em nosso sistema. Caso precise refazer a compra, estamos à disposição!"
                : "{$greeting} Verificamos o pedido {$orderNumber} no nosso sistema e ele consta como ".($status === 'cancelled' ? 'cancelado' : 'expirado').'. Se quiser ajuda para montar um novo pedido com as mesmas tonalidades disponíveis, estamos à disposição!';
        }

        if (! $facts['is_confirmed_paid']) {
            $payText = $facts['payment_status'] === 'failed'
                ? "Identificamos que o pagamento do pedido {$orderNumber} não foi aprovado e requer atenção."
                : "Identificamos que o pedido {$orderNumber} ainda está aguardando a confirmação do pagamento (status atual: ".($facts['payment_status'] ?? 'pendente').').';

            if ($toneLength === 'short') {
                return "{$greeting} {$payText} Assim que o pagamento for confirmado, daremos sequência à separação.";
            }

            return "{$greeting} {$payText} Por segurança, a separação dos produtos inicia somente após a confirmação oficial do pagamento. Se precisar de outro link ou meio de pagamento, nos avise!";
        }

        if ($isExchangeContext) {
            return $facts['open_occurrences_count'] > 0
                ? "{$greeting} Localizamos o seu pedido {$orderNumber} e a solicitação/ocorrência em atendimento com a nossa equipe de pós-venda. Vamos priorizar a conferência para orientar os próximos passos da troca ou devolução sem transtornos."
                : "{$greeting} Verificamos seu pedido {$orderNumber}. Para seguirmos com a sua solicitação de troca ou conferência do item, informe por favor qual produto/tonalidade deseja verificar para registrarmos o atendimento.";
        }

        if ($status === 'delivered' || $facts['delivered_at'] !== null) {
            return "{$greeting} Verificamos seu pedido {$orderNumber} e ele já consta como entregue".($facts['tracking_code'] ? " (código de rastreio {$facts['tracking_code']})" : '').'. Caso precise de qualquer conferência pós-entrega, conte com a gente!';
        }

        if ($status === 'shipped' || $facts['shipped_at'] !== null) {
            $trackPart = $facts['has_tracking']
                ? ' pela '.($facts['carrier'] ?: 'transportadora')." com o código de rastreio {$facts['tracking_code']}".($facts['tracking_url'] ? " ({$facts['tracking_url']})" : '')
                : ' e em breve os dados detalhados de rastreamento ficarão visíveis para acompanhamento';

            return $toneLength === 'short'
                ? "{$greeting} Seu pedido {$orderNumber} já foi enviado{$trackPart}."
                : "{$greeting} Ótima notícia! Seu pedido {$orderNumber} teve o pagamento confirmado e já foi enviado{$trackPart}. Qualquer dúvida no acompanhamento, estamos por aqui!";
        }

        $stage = $status === 'preparing' ? 'na etapa de separação' : 'com pagamento confirmado e encaminhado para separação';
        $delayNote = $isDelayContext
            ? ' Notamos uma pendência no prazo de expedição e já sinalizamos internamente para priorizar a postagem o quanto antes.'
            : ' Assim que for enviado, o código de rastreamento será disponibilizado.';

        if ($facts['open_occurrences_count'] > 0 || $facts['has_issue']) {
            $delayNote .= ' Nossa equipe também está acompanhando uma ocorrência registrada neste pedido para garantir que tudo saia certinho.';
        }

        if ($toneLength === 'short') {
            return "{$greeting} Verificamos seu pedido {$orderNumber}: o pagamento foi confirmado e ele está {$stage}.{$delayNote}";
        }

        $itemsPart = $toneLength === 'detailed' && ! empty($facts['items_summary'])
            ? ' Itens conferidos: '.implode(', ', array_slice($facts['items_summary'], 0, 5)).'.'
            : '';

        return "{$greeting} Verificamos seu pedido {$orderNumber} e ele já teve o pagamento confirmado. No momento, está {$stage}.{$itemsPart}{$delayNote} Agradecemos pela preferência na Mistura Feminina!";
    }

    /** @param array<string, mixed> $facts */
    private function passesFactualGuardrails(string $text, array $facts): bool
    {
        $lower = mb_strtolower($text);
        if (! $facts['is_confirmed_paid'] && (str_contains($lower, 'pagamento aprovado') || str_contains($lower, 'pagamento confirmado'))) {
            return false;
        }
        if ($facts['delivered_at'] === null && (str_contains($lower, 'já foi entregue') || str_contains($lower, 'consta como entregue'))) {
            return false;
        }

        return true;
    }

    private function buildWhatsappUrl(?string $phone, string $message): string
    {
        $digits = preg_replace('/\D/', '', (string) ($phone ?? '')) ?? '';
        if (strlen($digits) >= 10 && strlen($digits) <= 11) {
            $digits = '55'.$digits;
        }
        $encoded = rawurlencode($message);

        return $digits !== '' ? "https://wa.me/{$digits}?text={$encoded}" : "https://wa.me/?text={$encoded}";
    }
}
