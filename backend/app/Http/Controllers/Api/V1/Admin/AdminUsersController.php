<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LgpdRequest;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUsersController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
    ) {}

    public function listCustomers(Request $request): JsonResponse
    {
        $query = User::query()
            ->whereHas('roles', fn ($q) => $q->where('slug', 'customer'))
            ->withCount('orders')
            ->with('customerProfile')
            ->latest('id');

        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->query('search')).'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term));
        }

        return response()->json($query->paginate(20));
    }

    public function showCustomer(int $id): JsonResponse
    {
        $user = User::query()
            ->with(['customerProfile', 'addresses', 'orders' => fn ($q) => $q->latest('id')->limit(15)])
            ->findOrFail($id);

        return response()->json(['data' => $user]);
    }

    public function listLgpdRequests(): JsonResponse
    {
        return response()->json(LgpdRequest::query()->with('user:id,name,email')->latest('id')->paginate(25));
    }

    public function processLgpdRequest(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['completed', 'rejected'])],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $lgpd = LgpdRequest::query()->findOrFail($id);
        $lgpd->update([
            'status' => $validated['status'],
            'notes' => $validated['notes'] ?? $lgpd->notes,
            'processed_at' => now(),
            'processed_by' => $request->user()?->id,
        ]);

        if ($validated['status'] === 'completed' && in_array($lgpd->type, ['anonymization', 'deletion'], true) && $lgpd->user_id) {
            $target = User::query()->find($lgpd->user_id);
            if ($target) {
                $anonEmail = 'anon-'.$target->id.'-'.Str::random(6).'@anonimizado.local';
                $target->update([
                    'name' => 'Cliente Anonimizado #'.$target->id,
                    'email' => $anonEmail,
                    'phone' => null,
                    'cpf_cnpj' => null,
                    'is_active' => false,
                ]);
                $target->addresses()->delete();
            }
        }

        $this->audit->record('lgpd.processed', $request->user(), 'lgpd_request', $lgpd->id, null, ['status' => $lgpd->status], $request);

        return response()->json(['data' => $lgpd->fresh()]);
    }

    public function listTeam(): JsonResponse
    {
        $staff = User::query()
            ->whereHas('roles', fn ($q) => $q->where('slug', '!=', 'customer'))
            ->with('roles:id,slug,name')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'phone', 'is_active', 'two_factor_confirmed_at', 'last_login_at']);

        $roles = Role::query()->with('permissions:id,slug,module,name')->orderBy('id')->get();

        return response()->json(['data' => ['members' => $staff, 'roles' => $roles]]);
    }

    public function assignRole(Request $request, int $userId): JsonResponse
    {
        $validated = $request->validate([
            'role_slug' => ['required', 'string', 'exists:roles,slug'],
            'is_active' => ['boolean'],
        ]);

        $target = User::query()->findOrFail($userId);
        $role = Role::query()->where('slug', $validated['role_slug'])->firstOrFail();

        $oldRoles = $target->roleSlugs();
        $target->roles()->sync([$role->id]);
        if (array_key_exists('is_active', $validated)) {
            $target->update(['is_active' => (bool) $validated['is_active']]);
        }

        $this->audit->record('team.role_assigned', $request->user(), 'user', $target->id, ['roles' => $oldRoles], ['roles' => [$role->slug]], $request);

        return response()->json(['data' => $target->fresh('roles:id,slug,name')]);
    }

    public function listAuditLogs(Request $request): JsonResponse
    {
        $query = AuditLog::query()->with('user:id,name,email')->latest('id');
        if ($request->filled('action')) {
            $query->where('action', 'like', '%'.trim((string) $request->query('action')).'%');
        }

        return response()->json($query->paginate(30));
    }

    public function systemHealth(): JsonResponse
    {
        $failedJobsCount = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;
        $jobsPending = Schema::hasTable('jobs') ? DB::table('jobs')->count() : 0;

        $backupDir = storage_path('app/backups');
        $backups = [];
        if (is_dir($backupDir)) {
            foreach (File::files($backupDir) as $file) {
                $backups[] = [
                    'name' => $file->getFilename(),
                    'size_bytes' => $file->getSize(),
                    'modified_at' => date('c', $file->getMTime()),
                ];
            }
            usort($backups, fn (array $a, array $b): int => strcmp($b['modified_at'], $a['modified_at']));
        }

        return response()->json([
            'data' => [
                'php_version' => PHP_VERSION,
                'laravel_version' => app()->version(),
                'environment' => app()->environment(),
                'db_connection' => config('database.default'),
                'queue_connection' => config('queue.default'),
                'failed_jobs_count' => $failedJobsCount,
                'pending_jobs_count' => $jobsPending,
                'orders_total' => Order::query()->count(),
                'backups' => $backups,
            ],
        ]);
    }

    public function triggerBackup(Request $request): JsonResponse
    {
        Artisan::call('mistura:backup');
        $output = trim(Artisan::output());
        $this->audit->record('system.backup_created', $request->user(), 'backup', null, null, ['output' => $output], $request);

        return response()->json(['data' => ['message' => $output]]);
    }
}
