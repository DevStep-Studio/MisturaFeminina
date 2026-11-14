<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Não autenticado.'], 401);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Conta desativada.'], 403);
        }

        if (! $user->hasPermission($permission)) {
            return response()->json(['message' => 'Acesso negado para esta operação.'], 403);
        }

        return $next($request);
    }
}
