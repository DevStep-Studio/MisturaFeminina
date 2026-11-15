<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Sentry\State\Scope;
use Symfony\Component\HttpFoundation\Response;

class RequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->header('X-Request-ID');
        if (! is_string($id) || ! preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $id)) {
            $id = (string) Str::uuid();
        }
        $request->attributes->set('request_id', $id);
        Log::withContext(['request_id' => $id]);
        \Sentry\configureScope(function (Scope $scope) use ($id, $request): void {
            $scope->setTag('request_id', $id);
            $scope->setTag('http_method', $request->method());
        });
        $response = $next($request);
        $response->headers->set('X-Request-ID', $id);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
