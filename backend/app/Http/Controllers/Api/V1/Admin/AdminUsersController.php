<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CustomerProfile;
use App\Models\LgpdRequest;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
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
            ->withCount('orders')
            ->with(['customerProfile', 'roles:id,slug,name'])
            ->latest('id');

        $role = $request->query('role');
        if ($role && $role !== 'all') {
            $query->whereHas('roles', fn ($q) => $q->where('slug', $role));
        } elseif (! $request->has('role')) {
            $query->whereHas('roles', fn ($q) => $q->where('slug', 'customer'));
        }

        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->query('search')).'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term)->orWhere('phone', 'like', $term));
        }

        return response()->json($query->paginate(30));
    }

    public function showCustomer(int $id): JsonResponse
    {
        $user = User::query()
            ->with(['roles:id,slug,name', 'customerProfile', 'addresses', 'orders' => fn ($q) => $q->latest('id')->limit(15)])
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

    public function storeUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'email' => ['required', 'string', 'email:rfc', 'max:190', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cpf_cnpj' => ['nullable', 'string', 'max:20'],
            'password' => ['required', 'string', 'min:8'],
            'role_slug' => ['required', 'string', 'exists:roles,slug'],
            'is_active' => ['boolean'],
        ]);

        $role = Role::query()->where('slug', $validated['role_slug'])->firstOrFail();

        $user = DB::transaction(function () use ($validated, $role): User {
            $user = User::query()->create([
                'name' => trim((string) $validated['name']),
                'email' => strtolower(trim((string) $validated['email'])),
                'phone' => $validated['phone'] ?? null,
                'cpf_cnpj' => $validated['cpf_cnpj'] ?? null,
                'password' => Hash::make((string) $validated['password']),
                'is_active' => (bool) ($validated['is_active'] ?? true),
            ]);

            $user->roles()->sync([$role->id]);

            if ($role->slug === 'customer') {
                CustomerProfile::query()->firstOrCreate(
                    ['user_id' => $user->id],
                    ['newsletter_opt_in' => false]
                );
            }

            return $user;
        });

        $this->audit->record('admin.user_created', $request->user(), 'user', $user->id, null, ['email' => $user->email, 'role' => $role->slug], $request);

        return response()->json(['data' => $user->load('roles:id,slug,name')], 201);
    }

    public function updateUser(Request $request, int $id): JsonResponse
    {
        $user = User::query()->findOrFail($id);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'min:2', 'max:150'],
            'email' => ['sometimes', 'required', 'string', 'email:rfc', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'cpf_cnpj' => ['nullable', 'string', 'max:20'],
            'password' => ['nullable', 'string', 'min:8'],
            'role_slug' => ['nullable', 'string', 'exists:roles,slug'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $updates = [];
        if (array_key_exists('name', $validated)) {
            $updates['name'] = trim((string) $validated['name']);
        }
        if (array_key_exists('email', $validated)) {
            $updates['email'] = strtolower(trim((string) $validated['email']));
        }
        if (array_key_exists('phone', $validated)) {
            $updates['phone'] = $validated['phone'];
        }
        if (array_key_exists('cpf_cnpj', $validated)) {
            $updates['cpf_cnpj'] = $validated['cpf_cnpj'];
        }
        if (! empty($validated['password'])) {
            $updates['password'] = Hash::make((string) $validated['password']);
        }
        if (array_key_exists('is_active', $validated)) {
            $updates['is_active'] = (bool) $validated['is_active'];
        }

        if (! empty($updates)) {
            $user->update($updates);
        }

        if (! empty($validated['role_slug'])) {
            $role = Role::query()->where('slug', $validated['role_slug'])->firstOrFail();
            $user->roles()->sync([$role->id]);
        }

        $this->audit->record('admin.user_updated', $request->user(), 'user', $user->id, null, ['updated_fields' => array_keys($updates)], $request);

        return response()->json(['data' => $user->fresh(['roles:id,slug,name', 'customerProfile'])]);
    }

    public function destroyUser(Request $request, int $id): JsonResponse
    {
        if ($request->user()?->id === $id) {
            return response()->json(['message' => 'Você não pode desativar seu próprio usuário.'], 422);
        }

        $user = User::query()->findOrFail($id);
        $user->update(['is_active' => false]);
        $this->audit->record('admin.user_deactivated', $request->user(), 'user', $user->id, null, null, $request);

        return response()->json(['data' => ['message' => 'Usuário desativado com sucesso.']]);
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
