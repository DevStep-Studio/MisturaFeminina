<?php

namespace App\Domain\Payments\Services;

class GatewayFailure extends \RuntimeException
{
    public function __construct(public readonly bool $uncertain = false)
    {
        parent::__construct('Não foi possível confirmar a operação com o provedor. Consulte o pedido antes de tentar novamente.');
    }
}
