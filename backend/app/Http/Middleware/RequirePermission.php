<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Não autenticado.'], 401);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Conta desativada.'], 403);
        }

        $hasAny = false;
        foreach ($permissions as $permGroup) {
            foreach (explode('|', $permGroup) as $perm) {
                $trimmed = trim($perm);
                if ($trimmed !== '' && $user->hasPermission($trimmed)) {
                    $hasAny = true;
                    break 2;
                }
            }
        }

        if (! $hasAny) {
            return response()->json(['message' => 'Acesso negado para esta operação.'], 403);
        }

        return $next($request);
    }
}
