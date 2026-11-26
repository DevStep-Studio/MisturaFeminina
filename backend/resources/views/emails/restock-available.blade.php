@extends('emails.layout')
@section('title', 'Produto disponível novamente | Mistura Feminina')
@section('preheader', 'Boa notícia! '.$product->name.' voltou ao estoque.')
@section('content')
    <p style="margin:0 0 8px;color:#93509e;font-size:12px;font-weight:bold;letter-spacing:1px;">DE VOLTA À LOJA</p>
    <h1 style="margin:0 0 20px;font-size:25px;line-height:1.3;">Seu favorito voltou!</h1>
    <p>Boa notícia! O produto que você estava esperando está disponível novamente para compra.</p>
    <div style="padding:16px;background:#faf7fb;border:1px solid #eadfeb;border-radius:8px;">
        <strong>{{ $product->name }}</strong><br>{{ $variant->name }}
    </div>
    @php($productUrl = rtrim(config('app.frontend_url'), '/').'/produto/'.$product->slug)
    @include('emails.button', ['url' => $productUrl, 'label' => 'Ver produto na loja'])
    <p style="font-size:12px;color:#75657c;">Se o botão não funcionar, acesse:<br><a href="{{ $productUrl }}" style="color:#93509e;word-break:break-all;">{{ $productUrl }}</a></p>
@endsection
@section('footer', 'Você recebeu este e-mail porque pediu para ser avisado sobre a reposição deste produto.')
