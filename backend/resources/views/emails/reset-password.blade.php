@extends('emails.layout')
@section('title', 'Redefina sua senha | Mistura Feminina')
@section('preheader', 'Recebemos uma solicitação para redefinir sua senha. Acesse o link seguro para continuar.')
@section('content')
    <p style="margin:0 0 8px;color:#93509e;font-size:12px;font-weight:bold;letter-spacing:1px;">SEGURANÇA DA SUA CONTA</p>
    <h1 style="margin:0 0 20px;font-size:25px;line-height:1.3;color:#302237;">Vamos redefinir sua senha?</h1>
    <p>Olá!</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta na Mistura Feminina. Clique no botão abaixo para criar uma nova senha.</p>
    @include('emails.button', ['url' => $resetUrl, 'label' => 'Redefinir minha senha'])
    <p style="padding:14px 16px;background:#faf7fb;border-left:3px solid #93509e;border-radius:4px;">Por segurança, este link expira em <strong>{{ $expireMinutes }} {{ $expireMinutes === 1 ? 'minuto' : 'minutos' }}</strong>.</p>
    <p>Se você não solicitou esta alteração, pode ignorar este e-mail. Sua senha continuará a mesma.</p>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eadfeb;font-size:12px;color:#75657c;">
        <p>Se o botão não funcionar, copie e cole este link no navegador:</p>
        <a href="{{ $resetUrl }}" style="display:block;color:#93509e;word-break:break-all;overflow-wrap:anywhere;">{{ $resetUrl }}</a>
    </div>
@endsection
@section('footer', 'Mensagem enviada para proteger o acesso à sua conta.')
