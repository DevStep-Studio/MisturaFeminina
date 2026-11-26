<?php

namespace App\Domain\Payments\Services;

class GatewayFailure extends \RuntimeException
{
    private const MESSAGES = [
        'cc_rejected_insufficient_amount' => 'O cartão não possui limite suficiente. Use outro cartão ou meio de pagamento.',
        'cc_rejected_bad_filled_card_number' => 'Confira o número do cartão e tente novamente.',
        'cc_rejected_bad_filled_date' => 'Confira a validade do cartão e tente novamente.',
        'cc_rejected_bad_filled_security_code' => 'Confira o código de segurança do cartão e tente novamente.',
        'cc_rejected_bad_filled_other' => 'Confira os dados do titular do cartão e tente novamente.',
        'cc_rejected_invalid_installments' => 'O parcelamento não foi aceito para esse cartão.',
        'cc_rejected_call_for_authorize' => 'Autorize a compra com o banco emissor ou use outro cartão.',
        'cc_rejected_card_disabled' => 'O cartão está desabilitado. Consulte o banco emissor ou use outro cartão.',
        'cc_rejected_duplicated_payment' => 'O provedor identificou uma possível duplicidade. Consulte o status do pedido antes de tentar novamente.',
        'cc_rejected_high_risk' => 'O pagamento não foi autorizado pela análise de segurança do provedor. Use outro meio de pagamento.',
        'cc_rejected_max_attempts' => 'O limite de tentativas desse cartão foi atingido. Consulte o banco emissor.',
    ];

    /** @param list<string> $providerCodes */
    public function __construct(
        public readonly bool $uncertain = false,
        public readonly ?int $httpStatus = null,
        public readonly array $providerCodes = [],
    ) {
        parent::__construct('Não foi possível confirmar a operação com o provedor. Consulte o pedido antes de tentar novamente.');
    }

    public static function safeCode(mixed $code): ?string
    {
        if (! is_string($code) && ! is_int($code)) {
            return null;
        }
        $code = (string) $code;

        return preg_match('/^\d{1,10}$/D', $code) || isset(self::MESSAGES[$code]) || in_array($code, ['bad_request', 'unauthorized', 'forbidden', 'invalid_token', 'invalid_credentials', 'invalid_request_error', 'internal_error'], true) ? $code : null;
    }

    public static function rejectionMessage(mixed $detail): string
    {
        return is_string($detail) && isset(self::MESSAGES[$detail]) ? self::MESSAGES[$detail] : 'Pagamento recusado pelo provedor. Confira os dados ou use outro meio de pagamento.';
    }

    public function customerMessage(): string
    {
        if ($this->uncertain) {
            return 'Estamos confirmando o pagamento com o provedor. Atualize o status antes de tentar novamente.';
        }
        if (in_array($this->httpStatus, [401, 403], true)) {
            return 'O serviço de pagamento não pôde autenticar a operação. Entre em contato com a loja.';
        }
        if (in_array($this->httpStatus, [400, 422], true)) {
            return 'Os dados do pagamento não foram aceitos pelo provedor. Confira os dados informados ou entre em contato com a loja.';
        }

        return $this->getMessage();
    }
}
