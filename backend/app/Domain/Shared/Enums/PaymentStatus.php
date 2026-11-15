<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum PaymentStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Unknown = 'unknown';
    case Failed = 'failed';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';
    case PartiallyRefunded = 'partially_refunded';
    case ChargedBack = 'charged_back';
    case Expired = 'expired';
}
