<?php

declare(strict_types=1);

namespace App\Domain\Security\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditLogger
{
    private const REDACTED_KEYS = [
        'password',
        'password_confirmation',
        'current_password',
        'token',
        'card_token',
        'cvv',
        'security_code',
        'card_number',
        'pan',
        'access_token',
        'webhook_secret',
        'secret',
        'encrypted_credentials',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    /**
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     */
    public function record(
        string $action,
        ?User $actor = null,
        ?string $entityType = null,
        string|int|null $entityId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?Request $request = null,
    ): AuditLog {
        $req = $request ?? (app()->bound('request') ? request() : null);

        return AuditLog::query()->create([
            'user_id' => $actor?->id,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId !== null ? (string) $entityId : null,
            'old_values' => $oldValues !== null ? $this->sanitize($oldValues) : null,
            'new_values' => $newValues !== null ? $this->sanitize($newValues) : null,
            'ip_address' => $req?->ip(),
            'user_agent' => $req ? substr((string) $req->userAgent(), 0, 300) : null,
            'request_id' => $req?->attributes->get('request_id'),
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function sanitize(array $data): array
    {
        $clean = [];
        foreach ($data as $key => $value) {
            if (in_array(strtolower((string) $key), self::REDACTED_KEYS, true)) {
                $clean[$key] = '[REDACTED]';

                continue;
            }
            $clean[$key] = is_array($value) ? $this->sanitize($value) : $value;
        }

        return $clean;
    }
}
