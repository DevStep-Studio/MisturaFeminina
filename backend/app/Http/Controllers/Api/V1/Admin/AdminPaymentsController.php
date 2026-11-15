<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Payments\Services\PaymentService;
use App\Domain\Payments\Services\WebhookProcessorService;
use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\PaymentEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPaymentsController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly WebhookProcessorService $webhooks,
        private readonly AuditLogger $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Payment::query()->with('order:id,order_number,customer_name,customer_email,status')->latest('id');
        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }
        if ($request->filled('method')) {
            $query->where('method', (string) $request->query('method'));
        }

        return response()->json($query->paginate(25));
    }

    public function events(): JsonResponse
    {
        return response()->json(
            PaymentEvent::query()
                ->with('payment:id,order_id,method,status')
                ->latest('id')
                ->paginate(30)
        );
    }

    public function reconcile(Request $request, int $id): JsonResponse
    {
        $payment = Payment::query()->findOrFail($id);
        $remote = $this->payments->fetchRemoteOrderStatus($payment);
        if (! $remote) {
            return response()->json([
                'data' => $payment,
                'message' => 'Pagamento em sandbox local ou sem retorno remoto alterando o status.',
            ]);
        }

        $this->webhooks->applyPaymentTransition($payment, $remote['status'], $remote['fee_cents'], 'Reconciliação manual via backoffice');
        $this->audit->record('payment.reconciled', $request->user(), 'payment', $payment->id, null, ['status' => $remote['status']->value], $request);

        return response()->json(['data' => $payment->fresh('order')]);
    }
}
