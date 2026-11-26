@extends('emails.layout')
@section('title', $email['headline'].' | Mistura Feminina')
@section('preheader', $email['body'])
@section('content')
        <h1 style="font-size:23px;line-height:1.3;">{{ $email['headline'] }}</h1>
        <p>Olá, {{ $email['customer_name'] }}!</p>
        <p>{{ $email['body'] }}</p>
        <div style="background:#faf7fb;padding:16px;border-radius:8px;">
            <strong>Pedido {{ $email['order_number'] }}</strong><br>
            Status: {{ $email['status_label'] }}
            @if(!empty($email['payment_status']))<br>Pagamento: {{ $email['payment_status'] }}@endif
        </div>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;" role="presentation">
            @foreach($email['items'] as $item)
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">{{ $item['quantity'] }} × {{ $item['name'] }}<br><small>{{ $item['variant'] }}</small></td><td style="text-align:right;white-space:nowrap;border-bottom:1px solid #eee;">R$ {{ number_format($item['total_cents'] / 100, 2, ',', '.') }}</td></tr>
            @endforeach
        </table>
        <p>Frete: R$ {{ number_format($email['shipping_cents'] / 100, 2, ',', '.') }}<br>
        @if($email['discount_cents'])Desconto: R$ {{ number_format($email['discount_cents'] / 100, 2, ',', '.') }}<br>@endif
        <strong>Total: R$ {{ number_format($email['total_cents'] / 100, 2, ',', '.') }}</strong></p>
        @if(!empty($email['tracking_code']) || !empty($email['tracking_description']) || !empty($email['tracking_url']))
        <h2 style="font-size:18px;">Acompanhe a entrega</h2>
        @if(!empty($email['carrier']))<p>Transportadora: {{ $email['carrier'] }}</p>@endif
        @if(!empty($email['tracking_code']))<p>Código de rastreio: <strong>{{ $email['tracking_code'] }}</strong></p>@endif
        @if(!empty($email['tracking_description']))<p>{{ $email['tracking_description'] }}<br>{{ $email['tracking_location'] ?? '' }}</p>@endif
        @if($email['tracking_url'] || $email['tracking_page_url'])<p><a href="{{ $email['tracking_url'] ?: $email['tracking_page_url'] }}" style="color:#93509e;">Rastrear entrega</a></p>@endif
        @endif
        @if($email['order_url'])@include('emails.button', ['url' => $email['order_url'], 'label' => 'Acompanhar pedido'])@endif
@endsection
@section('footer', 'Este é um aviso automático sobre seu pedido na Mistura Feminina.')
