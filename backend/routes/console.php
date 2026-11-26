<?php

use App\Domain\AI\Services\InventoryReplenishmentAgent;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Security\Services\RbacSeederService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Jobs\ProcessPaymentEvent;
use App\Jobs\SendOrderEmailNotification;
use App\Models\Order;
use App\Models\OrderEmailNotification;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\OfficialCategoriesSeeder;
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
        ->whereDoesntHave('payments', fn ($q) => $q->whereIn('status', ['processing', 'unknown', 'pending']))
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

Artisan::command('mistura:reconcile-payments', function (PaymentService $payments): int {
    $pending = Payment::whereIn('status', ['pending', 'processing', 'unknown'])->where('updated_at', '<=', now()->subMinutes(2))->oldest('updated_at')->limit(100)->get();
    $updated = 0;
    foreach ($pending as $payment) {
        try {
            $payments->refresh($payment);
            $updated++;
        } catch (Throwable) {
            $this->warn('Conciliação pendente para pagamento #'.$payment->id);
        } finally {
            $payment->touch();
        }
    }
    PaymentEvent::where('status', 'received')->where('updated_at', '<', now()->subMinutes(5))->oldest('updated_at')->limit(100)->get()->each(function ($event): void {
        $event->touch();
        ProcessPaymentEvent::dispatch($event->id);
    });
    $this->info("Pagamentos reconciliados: {$updated}");

    return 0;
})->purpose('Reconcilia pagamentos pendentes diretamente na API do provedor.');

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
    $dumpedViaCli = false;

    $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    if (function_exists('system') && ! in_array('system', $disabled, true)) {
        $bin = is_executable('/usr/bin/mysqldump') ? '/usr/bin/mysqldump' : 'mysqldump';
        $cmd = sprintf(
            '%s --single-transaction --routines --triggers -h %s -P %s -u %s %s %s > %s 2>/dev/null',
            $bin,
            escapeshellarg((string) ($cfg['host'] ?? '127.0.0.1')),
            escapeshellarg((string) ($cfg['port'] ?? '3306')),
            escapeshellarg((string) ($cfg['username'] ?? '')),
            ! empty($cfg['password']) ? '-p'.escapeshellarg((string) $cfg['password']) : '',
            escapeshellarg((string) ($cfg['database'] ?? '')),
            escapeshellarg($target)
        );
        $code = 1;
        @system($cmd, $code);
        if ($code === 0 && is_file($target) && filesize($target) > 512) {
            $dumpedViaCli = true;
        }
    }

    if (! $dumpedViaCli) {
        try {
            $pdo = DB::connection($driver)->getPdo();
            $fh = fopen($target, 'wb');
            if ($fh === false) {
                $this->error('Não foi possível abrir arquivo de backup para escrita.');

                return 1;
            }

            $dbName = (string) ($cfg['database'] ?? '');
            fwrite($fh, "-- Mistura Feminina MySQL PDO Backup\n");
            fwrite($fh, '-- Generated at: '.now()->toIso8601String()."\n");
            fwrite($fh, "-- Database: {$dbName}\n\n");
            fwrite($fh, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");

            $tablesRows = DB::connection($driver)->select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            foreach ($tablesRows as $tRow) {
                $vals = array_values((array) $tRow);
                $table = (string) ($vals[0] ?? '');
                if ($table === '') {
                    continue;
                }
                $quotedTable = '`'.str_replace('`', '``', $table).'`';
                $createRow = (array) (DB::connection($driver)->selectOne("SHOW CREATE TABLE {$quotedTable}") ?? []);
                $createVals = array_values($createRow);
                $createSql = (string) ($createVals[1] ?? '');

                fwrite($fh, "-- Table {$quotedTable}\n");
                fwrite($fh, "DROP TABLE IF EXISTS {$quotedTable};\n");
                if ($createSql !== '') {
                    fwrite($fh, $createSql.";\n\n");
                }

                $stmt = $pdo->query("SELECT * FROM {$quotedTable}");
                if ($stmt === false) {
                    continue;
                }
                $batch = [];
                $colsHeader = null;
                while (($row = $stmt->fetch(PDO::FETCH_ASSOC)) !== false) {
                    if ($colsHeader === null) {
                        $colsHeader = implode(', ', array_map(
                            static fn (string $c): string => '`'.str_replace('`', '``', $c).'`',
                            array_keys($row)
                        ));
                    }
                    $escapedVals = [];
                    foreach ($row as $val) {
                        if ($val === null) {
                            $escapedVals[] = 'NULL';
                        } elseif (is_int($val) || is_float($val)) {
                            $escapedVals[] = (string) $val;
                        } elseif (is_bool($val)) {
                            $escapedVals[] = $val ? '1' : '0';
                        } else {
                            $escapedVals[] = $pdo->quote((string) $val);
                        }
                    }
                    $batch[] = '('.implode(', ', $escapedVals).')';
                    if (count($batch) >= 100) {
                        fwrite($fh, "INSERT INTO {$quotedTable} ({$colsHeader}) VALUES\n".implode(",\n", $batch).";\n");
                        $batch = [];
                    }
                }
                if ($batch !== [] && $colsHeader !== null) {
                    fwrite($fh, "INSERT INTO {$quotedTable} ({$colsHeader}) VALUES\n".implode(",\n", $batch).";\n");
                }
                fwrite($fh, "\n");
            }

            fwrite($fh, "SET FOREIGN_KEY_CHECKS=1;\n");
            fclose($fh);
        } catch (Throwable $e) {
            report($e);
            $this->error('Falha ao gerar backup MySQL: '.$e->getMessage());

            return 1;
        }
    }

    if (! is_file($target) || filesize($target) < 128) {
        $this->error('Arquivo de backup MySQL vazio ou inválido.');

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

Artisan::command('mistura:ai-replenishment-analyze', function (InventoryReplenishmentAgent $agent): int {
    $analysis = $agent->runAnalysis(null, [], 'scheduled');
    $this->info("Análise de reposição IA #{$analysis->id} concluída.");

    return 0;
})->purpose('Executa a análise automática de reposição inteligente por SKU.');

Schedule::command('mistura:release-expired-reservations')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('mistura:reconcile-payments')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('mistura:ai-replenishment-analyze')->dailyAt('06:00')->withoutOverlapping();

Artisan::command('catalog:seed-categories', function (): int {
    $seeder = new OfficialCategoriesSeeder;
    $stats = $seeder->seedOfficialCategories();
    $this->info("Categorias oficiais processadas: {$stats['created']} criada(s), {$stats['reused']} reaproveitada(s) (total oficial: {$stats['total_official']}).");

    return 0;
})->purpose('Cadastra de forma idempotente as categorias e subcategorias oficiais da Mistura Feminina.');

Artisan::command('mistura:retry-order-emails {--limit=100}', function (): int {
    $notifications = OrderEmailNotification::query()
        ->whereNull('sent_at')->where('attempts', '<', 3)
        ->where(fn ($query) => $query->whereNull('last_attempt_at')->orWhere('last_attempt_at', '<=', now()->subMinutes(5)))
        ->oldest('id')->limit(max(1, min(1000, (int) $this->option('limit'))))->get();
    foreach ($notifications as $notification) {
        try {
            SendOrderEmailNotification::dispatch($notification->id);
        } catch (Throwable) {
            $this->warn('Envio pendente para notificação #'.$notification->id);
        }
    }
    $this->info('Notificações processadas: '.$notifications->count());

    return 0;
})->purpose('Tenta novamente e-mails de pedidos ainda não enviados, com até três tentativas.');

Schedule::command('mistura:retry-order-emails')->everyFiveMinutes()->withoutOverlapping();
