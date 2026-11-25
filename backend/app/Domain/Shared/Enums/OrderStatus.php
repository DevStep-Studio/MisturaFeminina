<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum OrderStatus: string
{
    case PendingPayment = 'pending_payment';
    case Paid = 'paid';
    case Preparing = 'preparing';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';
    case PartiallyRefunded = 'partially_refunded';
    case PaymentFailed = 'payment_failed';
    case Expired = 'expired';

    public function label(): string
    {
        return match ($this) {
            self::PendingPayment => 'Aguardando pagamento',
            self::Paid => 'Pago',
            self::Preparing => 'Em separação',
            self::Shipped => 'Enviado',
            self::Delivered => 'Entregue',
            self::Cancelled => 'Cancelado',
            self::Refunded => 'Reembolsado',
            self::PartiallyRefunded => 'Parcialmente reembolsado',
            self::PaymentFailed => 'Pagamento recusado',
            self::Expired => 'Expirado',
        };
    }

    /** @return list<string> */
    public static function recognizedSaleValues(): array
    {
        return [
            self::Paid->value,
            self::Preparing->value,
            self::Shipped->value,
            self::Delivered->value,
            self::PartiallyRefunded->value,
        ];
    }

    public function isRecognizedSale(): bool
    {
        return in_array($this, [
            self::Paid,
            self::Preparing,
            self::Shipped,
            self::Delivered,
            self::PartiallyRefunded,
        ], true);
    }
}
