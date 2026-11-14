<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RestockAvailableMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public readonly Product $product,
        public readonly ProductVariant $variant,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Produto disponível novamente: {$this->product->name} | Mistura Feminina Cosméticos",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.restock-available',
        );
    }
}
