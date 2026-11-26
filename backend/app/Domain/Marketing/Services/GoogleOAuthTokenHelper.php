<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GoogleOAuthTokenHelper
{
    /**
     * Exchanges a Google Service Account JSON key for an OAuth2 Bearer access token.
     *
     * @param  string|array<string, mixed>  $serviceAccountJson
     * @param  list<string>  $scopes
     */
    public function tokenFromServiceAccount(string|array $serviceAccountJson, array $scopes): string
    {
        $parsed = is_array($serviceAccountJson)
            ? $serviceAccountJson
            : json_decode($serviceAccountJson, true);

        if (! is_array($parsed)) {
            throw new RuntimeException('JSON da Service Account inválido.');
        }

        $clientEmail = trim((string) ($parsed['client_email'] ?? ''));
        $privateKey = (string) ($parsed['private_key'] ?? '');
        $tokenUri = trim((string) ($parsed['token_uri'] ?? 'https://oauth2.googleapis.com/token'));

        if ($clientEmail === '' || $privateKey === '') {
            throw new RuntimeException('Service Account incompleta: client_email e private_key são obrigatórios.');
        }

        $now = time();
        $header = $this->base64UrlEncode((string) json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claims = $this->base64UrlEncode((string) json_encode([
            'iss' => $clientEmail,
            'scope' => implode(' ', $scopes),
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
        ]));

        $signingInput = "{$header}.{$claims}";
        $signature = '';
        $ok = @openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (! $ok) {
            throw new RuntimeException('Falha ao assinar JWT da Service Account (verifique a chave privada).');
        }

        $assertion = "{$signingInput}.".$this->base64UrlEncode($signature);

        $response = Http::asForm()
            ->timeout(15)
            ->post($tokenUri, [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion,
            ]);

        if (! $response->successful()) {
            $err = (string) ($response->json('error_description') ?? $response->json('error') ?? 'HTTP '.$response->status());
            throw new RuntimeException("Falha na autenticação OAuth Google ({$err}).");
        }

        $accessToken = trim((string) ($response->json('access_token') ?? ''));
        if ($accessToken === '') {
            throw new RuntimeException('Google OAuth não retornou access_token.');
        }

        return $accessToken;
    }

    /**
     * Exchanges an OAuth2 Refresh Token for an Access Token (used by Google Ads API).
     */
    public function tokenFromRefreshToken(string $clientId, string $clientSecret, string $refreshToken): string
    {
        $response = Http::asForm()
            ->timeout(15)
            ->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'refresh_token',
                'client_id' => trim($clientId),
                'client_secret' => trim($clientSecret),
                'refresh_token' => trim($refreshToken),
            ]);

        if (! $response->successful()) {
            $err = (string) ($response->json('error_description') ?? $response->json('error') ?? 'HTTP '.$response->status());
            throw new RuntimeException("Falha ao renovar token OAuth do Google Ads ({$err}).");
        }

        $accessToken = trim((string) ($response->json('access_token') ?? ''));
        if ($accessToken === '') {
            throw new RuntimeException('OAuth do Google Ads não retornou access_token.');
        }

        return $accessToken;
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
