<?php

declare(strict_types=1);

namespace App\Domain\Shipping\Contracts;

interface ShippingProvider
{
    public function code(): string;

    public function isConfigured(): bool;

    /**
     * @param  list<array{id: string, width: int, height: int, length: int, weight_grams: int, insurance_cents: int, quantity: int}>  $items
     * @return list<array{provider: string, service_code: string, service_name: string, carrier: string, price_cents: int, estimated_days: int, raw: array<string, mixed>}>
     */
    public function quote(string $originCep, string $destinationCep, array $items): array;
}
