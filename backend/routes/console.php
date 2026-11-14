<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;

Artisan::command('devstep:user {email} {--name=}', function () {
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
Artisan::command('devstep:health', function () {
    try {
        DB::select('SELECT 1');
        Redis::connection()->ping();
        $this->info('Banco e Redis disponíveis.');

        return 0;
    } catch (Throwable $e) {
        report($e);
        $this->error('Verificação falhou. Consulte os logs.');

        return 1;
    }
});
