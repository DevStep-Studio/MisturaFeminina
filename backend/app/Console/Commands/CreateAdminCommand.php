<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Security\Services\RbacSeederService;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class CreateAdminCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:create-admin 
                            {email? : O e-mail do administrador} 
                            {--name=Administrador : Nome do administrador} 
                            {--password= : Senha de acesso}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Cria ou atualiza um usuário administrador com permissões totais';

    public function handle(RbacSeederService $rbac): int
    {
        $this->info('Garantindo papéis e permissões no banco de dados...');
        $rbac->syncRolesAndPermissions();

        $email = $this->argument('email') ?? $this->ask('Qual o e-mail do administrador?', 'admin@misturafeminina.local');
        $email = strtolower(trim((string) $email));

        $name = (string) ($this->option('name') ?: 'Administrador');

        $password = $this->option('password');
        if (! $password) {
            $password = $this->secret('Digite a senha do administrador (ou Enter para "Mistura@Admin2026!")');
            if (! $password) {
                $password = 'Mistura@Admin2026!';
            }
        }

        $superRole = Role::query()->where('slug', RoleSlug::Superadmin->value)->first();
        if (! $superRole) {
            $this->error('Papel de superadministrador não encontrado.');
            return Command::FAILURE;
        }

        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => (string) $password,
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );

        $user->roles()->syncWithoutDetaching([$superRole->id]);

        $this->info("✓ Administrador configurado com sucesso!");
        $this->table(
            ['Campo', 'Valor'],
            [
                ['Nome', $user->name],
                ['E-mail', $user->email],
                ['Papel', 'Superadministrador (permissões totais)'],
                ['Status', 'Ativo'],
            ]
        );

        return Command::SUCCESS;
    }
}
