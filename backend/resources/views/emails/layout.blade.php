@php
    $storeUrl = preg_replace('/^http:/i', 'https:', rtrim((string) config('app.frontend_url'), '/'));
@endphp
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', 'Mistura Feminina')</title>
</head>
<body style="margin:0;padding:0;background:#faf7fb;font-family:Arial,Helvetica,sans-serif;color:#302237;-webkit-text-size-adjust:100%;">
    <div style="display:none;font-size:1px;line-height:1px;color:#faf7fb;max-height:0;max-width:0;opacity:0;overflow:hidden;">@yield('preheader')</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#faf7fb;">
        <tr><td align="center" style="padding:24px 12px;">
            <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #eadfeb;border-radius:12px;">
                <tr><td align="center" style="padding:28px 24px 24px;border-top:5px solid #93509e;border-bottom:1px solid #f0e6f2;">
                    <a href="{{ $storeUrl }}" style="text-decoration:none;color:#93509e;"><img src="{{ $storeUrl }}/logo-mf.png" width="170" height="93" alt="Mistura Feminina" style="display:block;width:170px;max-width:100%;height:auto;margin:0 auto;border:0;color:#93509e;font-size:18px;"></a>
                    <p style="margin:12px 0 0;color:#75657c;font-size:12px;letter-spacing:1px;">MISTURA FEMININA COSMÉTICOS</p>
                </td></tr>
                <tr><td style="padding:28px 24px;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-wrap:break-word;">
                    @yield('content')
                </td></tr>
                <tr><td align="center" style="padding:20px 24px;background:#f7f0f9;border-top:1px solid #eadfeb;font-size:12px;line-height:1.6;color:#75657c;">
                    <strong style="color:#684071;">Mistura Feminina Cosméticos</strong><br>
                    @yield('footer', 'Este é um aviso automático da Mistura Feminina.')<br>
                    <a href="{{ $storeUrl }}" style="color:#93509e;">Visite nossa loja</a>
                </td></tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
        </td></tr>
    </table>
</body>
</html>
