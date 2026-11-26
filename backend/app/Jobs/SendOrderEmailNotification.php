<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\OrderStatusMail;
use App\Models\OrderEmailNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendOrderEmailNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public int $notificationId) {}

    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(): void
    {
        $failure = DB::transaction(function (): ?\Throwable {
            $notification = OrderEmailNotification::query()->whereKey($this->notificationId)->lockForUpdate()->first();
            if (! $notification || $notification->sent_at || $notification->attempts >= $this->tries) {
                return null;
            }
            if (in_array(config('mail.default'), ['log', 'array'], true)) {
                $notification->update(['status' => 'failed', 'last_error' => 'Configure um remetente e um serviço de envio real, como SMTP, para enviar este e-mail.']);

                return null;
            }
            $notification->update(['attempts' => $notification->attempts + 1, 'last_attempt_at' => now()]);
            try {
                Mail::to($notification->recipient)->sendNow(new OrderStatusMail($notification->payload));
                $notification->update(['status' => 'sent', 'sent_at' => now(), 'last_error' => null]);
            } catch (\Throwable $error) {
                $notification->update(['status' => 'failed', 'last_error' => 'Não foi possível enviar o e-mail. Verifique SMTP e remetente.']);
                Log::warning('order_email.delivery_failed', ['notification_id' => $notification->id, 'order_id' => $notification->order_id, 'failure_type' => $error::class]);

                return $error;
            }

            return null;
        });
        if ($failure) {
            throw $failure;
        }
    }
}
