<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Produto disponível</title>
</head>
<body style="margin:0;padding:24px;background:#f8f7f8;font-family:Arial,sans-serif;color:#18181b;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
        <div style="background:#8b2252;color:#ffffff;padding:20px 24px;">
            <strong style="font-size:18px;">Mistura Feminina Cosméticos</strong>
        </div>
        <div style="padding:24px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">Boa notícia! O produto voltou ao estoque</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
                <strong>{{ $product->name }}</strong> ({{ $variant->name }}) está disponível novamente para compra.
            </p>
            <p style="margin:0;font-size:14px;">
                Acesse: {{ rtrim(config('app.frontend_url'), '/') }}/produto/{{ $product->slug }}
            </p>
        </div>
    </div>
</body>
</html>

