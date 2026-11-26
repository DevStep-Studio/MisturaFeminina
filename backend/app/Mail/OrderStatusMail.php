<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class OrderStatusMail extends Mailable
{
    /** @param array<string, mixed> $data */
    public function __construct(public readonly array $data) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "{$this->data['headline']} — Pedido {$this->data['order_number']} | Mistura Feminina");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.order-status', with: ['email' => $this->data]);
    }
}
