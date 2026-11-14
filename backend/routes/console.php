<?php

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Payments\Services\MercadoPagoService;
use App\Domain\Payments\Services\WebhookProcessorService;
use App\Domain\Security\Services\RbacSeederService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Str;

Artisan::command('devstep:user {email} {--name=}', function (): int {
    $email = $this->argument('email');
    if (! filter_var($email, FILTER_VALIDATE_EMAIL) || User::where('email', $email)->exists()) {
        $this->error('E-mail inválido ou já cadastrado.');

        return 1;
    }
    $password = $this->secret('Senha (mínimo 12 caracteres, maiúscula, minúscula e número)');
    if (! is_string($password) || strlen($password) < 12 || ! preg_match('/[A-Z]/', $password) || ! preg_match('/[a-z]/', $password) || ! preg_match('/[0-9]/', $password)) {
        $this->error('Senha inválida.');

        return 1;
    }
    User::create(['name' => $this->option('name') ?: $this->ask('Nome'), 'email' => $email, 'password' => Hash::make($password)]);
    $this->info('Usuário criado.');

    return 0;
});

Artisan::command('mistura:admin {email} {--name=} {--role=superadmin} {--password=} {--force-reset}', function (RbacSeederService $rbac): int {
    $rbac->syncRolesAndPermissions();
    $email = strtolower(trim((string) $this->argument('email')));
    if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $this->error('E-mail inválido.');

        return 1;
    }
    $roleSlug = (string) $this->option('role');
    $role = Role::query()->where('slug', $roleSlug)->first();
    if (! $role) {
        $this->error("Papel inválido: {$roleSlug}");

        return 1;
    }
    $password = $this->option('password') ?: $this->secret('Senha administrativa (mín. 12 chars, maiúscula, minúscula e número)');
    if (! is_string($password) || strlen($password) < 12 || ! preg_match('/[A-Z]/', $password) || ! preg_match('/[a-z]/', $password) || ! preg_match('/[0-9]/', $password)) {
        $this->error('Senha não atende aos requisitos mínimos de segurança.');

        return 1;
    }

    $user = User::query()->updateOrCreate(
        ['email' => $email],
        [
            'name' => $this->option('name') ?: 'Administrador Mistura Feminina',
            'password' => Hash::make($password),
            'is_active' => true,
            'must_reset_password' => (bool) $this->option('force-reset'),
        ]
    );
    $user->roles()->syncWithoutDetaching([$role->id]);
    $this->info("Administrador {$email} provisionado com papel {$roleSlug}.");

    return 0;
})->purpose('Provisiona ou atualiza usuário administrativo da Mistura Feminina com RBAC.');

Artisan::command('mistura:release-expired-reservations', function (InventoryService $inventory): int {
    $expiredOrders = Order::query()
        ->where('status', OrderStatus::PendingPayment)
        ->whereNotNull('stock_reserved_until')
        ->where('stock_reserved_until', '<=', now())
        ->get();

    $count = 0;
    foreach ($expiredOrders as $order) {
        $inventory->releaseReservation($order, 'Reserva expirada por tempo limite de pagamento');
        $order->update(['status' => OrderStatus::Expired]);
        $order->statusHistories()->create([
            'from_status' => OrderStatus::PendingPayment->value,
            'to_status' => OrderStatus::Expired->value,
            'note' => 'Pedido expirado automaticamente após prazo limite.',
        ]);
        $count++;
    }
    $this->info("Reservas expiradas liberadas: {$count}");

    return 0;
})->purpose('Libera reservas de estoque de pedidos pendentes vencidos.');

Artisan::command('mistura:reconcile-payments', function (MercadoPagoService $mp, WebhookProcessorService $webhooks): int {
    $pendingOrders = Order::query()
        ->where('status', OrderStatus::PendingPayment)
        ->where('created_at', '<=', now()->subMinutes(2))
        ->with('latestPayment')
        ->limit(50)
        ->get();

    $updated = 0;
    foreach ($pendingOrders as $order) {
        $payment = $order->latestPayment;
        if (! $payment) {
            continue;
        }
        $remote = $mp->fetchRemoteOrderStatus($payment);
        if ($remote && $remote['status'] !== PaymentStatus::Pending) {
            $webhooks->applyPaymentTransition($payment, $remote['status'], $remote['fee_cents'], 'Reconciliação automática');
            $updated++;
        }
    }
    $this->info("Pagamentos reconciliados: {$updated}");

    return 0;
})->purpose('Reconcilia pedidos pendentes diretamente na API do Mercado Pago.');

Artisan::command('mistura:backup', function (): int {
    $dir = storage_path('app/backups');
    if (! is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    $stamp = now()->format('Ymd_His').'_'.Str::random(4);
    $driver = config('database.default');
    if ($driver === 'sqlite') {
        $dbPath = config('database.connections.sqlite.database');
        if ($dbPath === ':memory:') {
            $target = "{$dir}/backup_sqlite_{$stamp}.json";
            file_put_contents($target, json_encode(['driver' => 'sqlite:memory', 'created_at' => now()->toIso8601String()], JSON_THROW_ON_ERROR));
            $this->info("Backup criado em: {$target}");

            return 0;
        }
        if (! is_string($dbPath) || ! file_exists($dbPath)) {
            $this->error('Arquivo SQLite não encontrado.');

            return 1;
        }
        $target = "{$dir}/backup_sqlite_{$stamp}.sqlite";
        copy($dbPath, $target);
        $this->info("Backup criado em: {$target}");

        return 0;
    }

    $cfg = config("database.connections.{$driver}");
    $target = "{$dir}/backup_{$driver}_{$stamp}.sql";
    $cmd = sprintf(
        'mysqldump -h %s -P %s -u %s %s %s > %s',
        escapeshellarg((string) $cfg['host']),
        escapeshellarg((string) $cfg['port']),
        escapeshellarg((string) $cfg['username']),
        ! empty($cfg['password']) ? '-p'.escapeshellarg((string) $cfg['password']) : '',
        escapeshellarg((string) $cfg['database']),
        escapeshellarg($target)
    );
    $code = 0;
    system($cmd, $code);
    if ($code !== 0) {
        $this->error('Falha ao executar mysqldump.');

        return 1;
    }
    $this->info("Backup MySQL criado em: {$target}");

    return 0;
})->purpose('Cria backup consistente do banco de dados.');

Artisan::command('devstep:health', function (): int {
    try {
        DB::select('SELECT 1');
        if (config('cache.default') === 'redis' || config('queue.default') === 'redis') {
            Redis::connection()->ping();
            $this->info('Banco e Redis disponíveis.');
        } else {
            $this->info('Banco disponível (cache/fila em driver database).');
        }

        return 0;
    } catch (Throwable $e) {
        report($e);
        $this->error('Verificação falhou. Consulte os logs.');

        return 1;
    }
});

Schedule::command('mistura:release-expired-reservations')->everyFiveMinutes();
Schedule::command('mistura:reconcile-payments')->everyFiveMinutes();
