<?php

declare(strict_types=1);

namespace App\Domain\Shared\Enums;

enum PaymentMethod: string
{
    case Pix = 'pix';
    case Boleto = 'boleto';
    case CreditCard = 'credit_card';
    case DebitCard = 'debit_card';
}
