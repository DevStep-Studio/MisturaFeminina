<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>{{ $headline }}</title>
</head>
<body style="margin:0;padding:24px;background:#f8f7f8;font-family:Arial,sans-serif;color:#18181b;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
        <div style="background:#8b2252;color:#ffffff;padding:20px 24px;">
            <strong style="font-size:18px;">Mistura Feminina Cosméticos</strong>
        </div>
        <div style="padding:24px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">{{ $headline }}</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Olá, {{ $order->customer_name }}.</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">{{ $bodyText }}</p>
            <div style="background:#f8f7f8;border:1px solid #e4e4e7;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
                <div style="font-size:13px;"><strong>Pedido:</strong> {{ $order->order_number }}</div>
                <div style="font-size:13px;margin-top:4px;"><strong>Status:</strong> {{ $order->status->value }}</div>
                <div style="font-size:13px;margin-top:4px;"><strong>Total:</strong> R$ {{ number_format($order->total_cents / 100, 2, ',', '.') }}</div>
            </div>
            <p style="margin:0;font-size:13px;color:#52525b;">
                Acompanhe seu pedido em: {{ rtrim(config('app.frontend_url'), '/') }}/pedido/{{ $order->public_token }}/confirmacao
            </p>
        </div>
    </div>
</body>
</html>

