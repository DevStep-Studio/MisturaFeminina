<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

require dirname(__DIR__).'/backend/vendor/autoload.php';
$app = require dirname(__DIR__).'/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @param array<string, mixed> $data */
function result(array $data, int $code = 0): never
{
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE).PHP_EOL;
    exit($code);
}

function databaseFailure(Throwable $exception): never
{
    $current = $exception;
    $number = 0;
    do {
        if ($current instanceof PDOException && isset($current->errorInfo[1])) {
            $number = (int) $current->errorInfo[1];
        }
        $current = $current->getPrevious();
    } while ($current !== null);
    match ($number) {
        1049 => result(['message' => 'Banco ainda não existe.', 'reason' => 'missing_database'], 20),
        2002, 2003 => result(['message' => 'MySQL não está acessível no host/porta configurados.', 'reason' => 'unreachable'], 21),
        1044, 1045, 1698 => result(['message' => 'MySQL recusou o acesso. Revise DB_USERNAME, DB_PASSWORD e permissões no backend/.env.', 'reason' => 'credentials'], 22),
        default => result(['message' => 'Falha ao conectar ao banco. Confira driver, host, porta e extensões PDO no backend/.env.', 'reason' => 'database'], 23),
    };
}

if (! $app->environment(['local', 'development'])) {
    result(['message' => 'Inicializador permitido somente com APP_ENV=local ou development.'], 40);
}

$action = $argv[1] ?? 'inspect';
$connection = DB::connection();
$config = $connection->getConfig();
if (! in_array($config['driver'], ['mysql', 'mariadb', 'sqlite'], true)) {
    result(['message' => 'Este inicializador espera DB_CONNECTION=mysql, mariadb ou sqlite.'], 40);
}

if ($action === 'inspect') {
    $queue = config('queue.default');
    $cache = config('cache.default');
    $session = config('session.driver');
    result([
        'keyMissing' => ! (bool) config('app.key'),
        'databaseHost' => $config['host'] ?? '127.0.0.1',
        'databasePort' => (int) ($config['port'] ?? 3306),
        'redisRequired' => $queue === 'redis' || $cache === 'redis' || $session === 'redis',
        'redisHost' => config('database.redis.default.host', '127.0.0.1'),
        'redisPort' => (int) config('database.redis.default.port', 6379),
    ]);
}

if ($action === 'redis') {
    if (config('database.redis.client') === 'phpredis' && ! extension_loaded('redis')) {
        result(['message' => 'A extensão PHP Redis não está habilitada. Instale-a ou use drivers database no ambiente local.'], 26);
    }
    try {
        Redis::connection()->ping();
        result(['message' => 'Redis conectado.']);
    } catch (Throwable $exception) {
        if (str_contains($exception->getMessage(), 'NOAUTH') || str_contains($exception->getMessage(), 'WRONGPASS')) {
            result(['message' => 'Redis recusou a autenticação. Revise REDIS_PASSWORD no backend/.env.'], 25);
        }
        result(['message' => 'Redis indisponível. Revise REDIS_HOST/REDIS_PORT, senha e extensão PHP Redis; ou use drivers database no ambiente local.'], 24);
    }
}

if (! in_array($action, ['probe', 'prepare'], true)) {
    result(['message' => 'Ação desconhecida.'], 40);
}

if ($config['driver'] === 'sqlite') {
    $dbPath = (string) ($config['database'] ?? '');
    if ($action === 'prepare' && $dbPath !== '' && $dbPath !== ':memory:' && ! file_exists($dbPath)) {
        touch($dbPath);
    }
    try {
        $connection->getPdo();
        result(['message' => 'SQLite local conectado.']);
    } catch (Throwable $exception) {
        databaseFailure($exception);
    }
}

try {
    $connection->getPdo();
    result(['message' => 'MySQL conectado.']);
} catch (Throwable $exception) {
    $previous = $exception;
    $number = 0;
    do {
        if ($previous instanceof PDOException && isset($previous->errorInfo[1])) {
            $number = (int) $previous->errorInfo[1];
        }
        $previous = $previous->getPrevious();
    } while ($previous !== null);
    if ($action !== 'prepare' || $number !== 1049) {
        databaseFailure($exception);
    }
}

$name = $config['database'] ?? '';
if (! is_string($name) || $name === '' || strlen($name) > 64 || str_contains($name, "\0")) {
    result(['message' => 'DB_DATABASE precisa ser um nome válido com até 64 bytes.'], 23);
}

try {
    // The resolved connection config already contains values from DB_URL, if supplied.
    $server = DB::build(array_replace($config, ['url' => null, 'database' => '']));
    $identifier = '`'.str_replace('`', '``', $name).'`';
    $server->statement('CREATE DATABASE IF NOT EXISTS '.$identifier.' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    DB::purge();
    DB::connection()->getPdo();
    result(['message' => 'Banco criado e conexão validada.']);
} catch (Throwable) {
    result(['message' => 'Não foi possível criar o banco. O usuário de DB_USERNAME precisa da permissão CREATE DATABASE; ou crie o banco manualmente.'], 23);
}
