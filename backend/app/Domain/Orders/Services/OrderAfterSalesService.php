<?php

declare(strict_types=1);

namespace App\Domain\Orders\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderOccurrence;
use App\Models\OrderOccurrenceNote;
use App\Models\OrderTimelineEvent;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrderAfterSalesService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** @return list<array<string, mixed>> */
    public function buildUnifiedTimeline(Order $order, ?string $categoryFilter = null): array
    {
        $order->loadMissing([
            'statusHistories.user:id,name',
            'payments.events',
            'shipment.trackingEvents',
            'refunds',
            'timelineEvents.user:id,name',
            'occurrences.createdBy:id,name',
            'occurrenceNotes.user:id,name',
        ]);

        $events = [];

        $events[] = [
            'id' => "order-created-{$order->id}",
            'category' => 'internal',
            'event_type' => 'order_created',
            'title' => "Pedido {$order->order_number} criado",
            'description' => "Cliente: {$order->customer_name}",
            'origin' => $order->assisted_order_id ? 'staff' : 'customer',
            'actor_name' => $order->customer_name,
            'occurred_at' => $order->created_at?->toIso8601String(),
        ];

        foreach ($order->statusHistories as $h) {
            $events[] = [
                'id' => "status-{$h->id}",
                'category' => 'logistics',
                'event_type' => 'status_changed',
                'title' => "Status atualizado para {$h->to_status}",
                'description' => $h->note ?: ($h->from_status ? "De {$h->from_status} para {$h->to_status}" : null),
                'origin' => $h->user_id ? 'staff' : 'system',
                'actor_name' => $h->user->name ?? 'Sistema',
                'occurred_at' => $h->created_at?->toIso8601String(),
            ];
        }

        foreach ($order->payments as $pay) {
            $events[] = [
                'id' => "payment-{$pay->id}",
                'category' => 'payment',
                'event_type' => 'payment_status',
                'title' => 'Pagamento '.strtoupper($pay->method->value).' ('.$pay->status->value.')',
                'description' => 'Valor: R$ '.number_format($pay->gross_amount_cents / 100, 2, ',', '.'),
                'origin' => 'integration',
                'actor_name' => $pay->provider,
                'occurred_at' => ($pay->paid_at ?? $pay->created_at)?->toIso8601String(),
            ];
        }

        if ($order->shipment) {
            $ship = $order->shipment;
            if ($ship->tracking_code) {
                $events[] = [
                    'id' => "ship-tracking-{$ship->id}",
                    'category' => 'logistics',
                    'event_type' => 'tracking_registered',
                    'title' => "Código de rastreio cadastrado: {$ship->tracking_code}",
                    'description' => "{$ship->carrier} • {$ship->service_name}",
                    'origin' => 'staff',
                    'actor_name' => 'Expedição',
                    'occurred_at' => ($ship->shipped_at ?? $ship->updated_at)?->toIso8601String(),
                ];
            }
            foreach ($ship->trackingEvents as $te) {
                $events[] = [
                    'id' => "track-{$te->id}",
                    'category' => 'logistics',
                    'event_type' => 'tracking_update',
                    'title' => $te->description,
                    'description' => $te->location,
                    'origin' => 'integration',
                    'actor_name' => $ship->carrier,
                    'occurred_at' => $te->occurred_at?->toIso8601String(),
                ];
            }
        }

        foreach ($order->refunds as $ref) {
            $events[] = [
                'id' => "refund-{$ref->id}",
                'category' => 'returns',
                'event_type' => 'refund',
                'title' => 'Reembolso processado ('.$ref->status.')',
                'description' => $ref->reason,
                'origin' => 'staff',
                'actor_name' => 'Financeiro',
                'occurred_at' => $ref->created_at?->toIso8601String(),
            ];
        }

        foreach ($order->timelineEvents as $ev) {
            $events[] = [
                'id' => "timeline-{$ev->id}",
                'category' => $ev->category,
                'event_type' => $ev->event_type,
                'title' => $ev->title,
                'description' => $ev->description,
                'origin' => $ev->origin,
                'actor_name' => $ev->actor_name ?? ($ev->user->name ?? 'Sistema'),
                'occurred_at' => $ev->occurred_at->toIso8601String(),
            ];
        }

        if ($categoryFilter !== null && $categoryFilter !== '') {
            $events = array_values(array_filter($events, fn (array $e): bool => $e['category'] === $categoryFilter));
        }

        usort($events, fn (array $a, array $b): int => strcmp((string) ($b['occurred_at'] ?? ''), (string) ($a['occurred_at'] ?? '')));

        return $events;
    }

    /** @param array<string, mixed> $data */
    public function createOccurrence(Order $order, array $data, User $actor): OrderOccurrence
    {
        return DB::transaction(function () use ($order, $data, $actor): OrderOccurrence {
            $orderItem = null;
            $snapshot = null;
            if (! empty($data['order_item_id'])) {
                /** @var OrderItem $orderItem */
                $orderItem = $order->items()->where('id', (int) $data['order_item_id'])->firstOrFail();
                $snapshot = [
                    'product_name' => $orderItem->product_name_snapshot,
                    'variant_name' => $orderItem->variant_name_snapshot,
                    'sku' => $orderItem->sku_snapshot,
                    'quantity' => $orderItem->quantity,
                    'unit_price_cents' => $orderItem->unit_price_cents,
                ];
            }

            $occ = OrderOccurrence::query()->create([
                'occurrence_number' => 'OC-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'order_id' => $order->id,
                'order_item_id' => $orderItem?->id,
                'type' => (string) $data['type'],
                'priority' => (string) ($data['priority'] ?? 'normal'),
                'status' => 'open',
                'affected_qty' => max(1, (int) ($data['affected_qty'] ?? 1)),
                'description' => trim((string) $data['description']),
                'assigned_to_user_id' => ! empty($data['assigned_to_user_id']) ? (int) $data['assigned_to_user_id'] : $actor->id,
                'created_by_user_id' => $actor->id,
                'due_at' => ! empty($data['due_at']) ? CarbonImmutable::parse((string) $data['due_at']) : null,
                'product_snapshot' => $snapshot,
                'history_log' => [
                    [
                        'at' => now()->toIso8601String(),
                        'user_name' => $actor->name,
                        'action' => 'created',
                        'status' => 'open',
                    ],
                ],
            ]);

            $order->update([
                'has_issue' => true,
                'issue_reason' => "Ocorrência {$occ->occurrence_number}: {$occ->type}",
            ]);

            OrderTimelineEvent::query()->create([
                'order_id' => $order->id,
                'user_id' => $actor->id,
                'category' => in_array($occ->type, ['exchange', 'return'], true) ? 'returns' : 'support',
                'event_type' => 'occurrence_created',
                'title' => "Ocorrência {$occ->occurrence_number} aberta ({$occ->type})",
                'description' => $occ->description.($snapshot ? " — Item: {$snapshot['product_name']} ({$snapshot['variant_name']})" : ''),
                'origin' => 'staff',
                'actor_name' => $actor->name,
                'metadata' => ['occurrence_id' => $occ->id],
                'occurred_at' => now(),
            ]);

            $this->audit->record(
                'order.occurrence_created',
                $actor,
                'order_occurrence',
                $occ->id,
                null,
                ['order_id' => $order->id, 'type' => $occ->type],
            );

            return $occ->fresh(['assignedTo:id,name', 'createdBy:id,name', 'orderItem', 'notes.user:id,name']) ?? $occ;
        });
    }

    /** @param array<string, mixed> $data */
    public function updateOccurrence(OrderOccurrence $occurrence, array $data, User $actor): OrderOccurrence
    {
        return DB::transaction(function () use ($occurrence, $data, $actor): OrderOccurrence {
            $oldStatus = $occurrence->status;
            $oldAssignee = $occurrence->assigned_to_user_id;

            $updates = [];
            foreach (['status', 'priority', 'resolution_type', 'resolution_notes', 'reverse_tracking_code'] as $field) {
                if (array_key_exists($field, $data)) {
                    $updates[$field] = $data[$field];
                }
            }
            if (array_key_exists('assigned_to_user_id', $data)) {
                $updates['assigned_to_user_id'] = $data['assigned_to_user_id'] ? (int) $data['assigned_to_user_id'] : null;
            }
            if (isset($updates['status']) && in_array($updates['status'], ['resolved', 'closed'], true) && $occurrence->resolved_at === null) {
                $updates['resolved_at'] = now();
            }

            $history = $occurrence->history_log ?? [];
            $history[] = [
                'at' => now()->toIso8601String(),
                'user_name' => $actor->name,
                'action' => 'updated',
                'from_status' => $oldStatus,
                'to_status' => $updates['status'] ?? $oldStatus,
                'assigned_to_user_id' => $updates['assigned_to_user_id'] ?? $oldAssignee,
            ];
            $updates['history_log'] = $history;

            $occurrence->update($updates);

            $order = $occurrence->order;
            if ($order) {
                $stillHasOpen = $order->occurrences()->whereNotIn('status', ['resolved', 'closed'])->exists();
                if (! $stillHasOpen) {
                    $order->update(['has_issue' => false, 'issue_reason' => null]);
                }

                OrderTimelineEvent::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $actor->id,
                    'category' => in_array($occurrence->type, ['exchange', 'return'], true) ? 'returns' : 'support',
                    'event_type' => 'occurrence_updated',
                    'title' => "Ocorrência {$occurrence->occurrence_number}: {$oldStatus} → {$occurrence->status}",
                    'description' => $occurrence->resolution_notes ?: 'Atendimento atualizado.',
                    'origin' => 'staff',
                    'actor_name' => $actor->name,
                    'metadata' => ['occurrence_id' => $occurrence->id],
                    'occurred_at' => now(),
                ]);
            }

            $this->audit->record(
                'order.occurrence_updated',
                $actor,
                'order_occurrence',
                $occurrence->id,
                ['status' => $oldStatus, 'assigned_to_user_id' => $oldAssignee],
                $updates,
            );

            return $occurrence->fresh(['assignedTo:id,name', 'createdBy:id,name', 'orderItem', 'notes.user:id,name']) ?? $occurrence;
        });
    }

    /** @param array<string, mixed> $data */
    public function addNote(Order $order, array $data, User $actor): OrderOccurrenceNote
    {
        $body = trim((string) ($data['body'] ?? ''));
        if ($body === '') {
            throw ValidationException::withMessages(['body' => ['Informe o conteúdo da nota interna.']]);
        }

        $occurrenceId = ! empty($data['order_occurrence_id']) ? (int) $data['order_occurrence_id'] : null;
        if ($occurrenceId !== null) {
            $order->occurrences()->where('id', $occurrenceId)->firstOrFail();
        }

        $note = OrderOccurrenceNote::query()->create([
            'order_id' => $order->id,
            'order_occurrence_id' => $occurrenceId,
            'user_id' => $actor->id,
            'note_type' => (string) ($data['note_type'] ?? 'internal'),
            'body' => $body,
            'next_action' => isset($data['next_action']) ? (trim((string) $data['next_action']) ?: null) : null,
        ]);

        OrderTimelineEvent::query()->create([
            'order_id' => $order->id,
            'user_id' => $actor->id,
            'category' => 'internal',
            'event_type' => 'internal_note',
            'title' => 'Nota interna registrada por '.$actor->name,
            'description' => $body.($note->next_action ? " (Próxima ação: {$note->next_action})" : ''),
            'origin' => 'staff',
            'actor_name' => $actor->name,
            'occurred_at' => now(),
        ]);

        return $note->fresh('user:id,name') ?? $note;
    }
}
