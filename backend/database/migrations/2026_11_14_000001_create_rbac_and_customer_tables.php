<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('phone', 30)->nullable()->after('email');
            $table->string('cpf_cnpj', 20)->nullable()->after('phone');
            $table->boolean('is_active')->default(true)->after('password');
            $table->boolean('must_reset_password')->default(false)->after('is_active');
            $table->text('two_factor_secret')->nullable()->after('must_reset_password');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_secret');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_confirmed_at');
            $table->timestamp('last_login_at')->nullable()->after('two_factor_recovery_codes');
            $table->index('cpf_cnpj');
        });

        Schema::create('roles', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 100)->unique();
            $table->string('module', 60)->index();
            $table->string('name', 120);
            $table->timestamps();
        });

        Schema::create('role_user', function (Blueprint $table): void {
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['role_id', 'user_id']);
        });

        Schema::create('permission_role', function (Blueprint $table): void {
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->primary(['permission_id', 'role_id']);
        });

        Schema::create('customer_profiles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->date('birth_date')->nullable();
            $table->boolean('newsletter_opt_in')->default(false);
            $table->timestamp('newsletter_opt_in_at')->nullable();
            $table->boolean('whatsapp_opt_in')->default(false);
            $table->boolean('wholesale_approved')->default(false);
            $table->string('notes', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 60)->default('Principal');
            $table->string('recipient_name', 150);
            $table->string('phone', 30)->nullable();
            $table->string('cep', 9)->index();
            $table->string('street', 180);
            $table->string('number', 30);
            $table->string('complement', 120)->nullable();
            $table->string('neighborhood', 120);
            $table->string('city', 120);
            $table->string('state', 2);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('lgpd_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email', 190)->index();
            $table->string('type', 30);
            $table->string('status', 30)->default('pending');
            $table->text('notes')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lgpd_requests');
        Schema::dropIfExists('addresses');
        Schema::dropIfExists('customer_profiles');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['cpf_cnpj']);
            $table->dropColumn([
                'phone',
                'cpf_cnpj',
                'is_active',
                'must_reset_password',
                'two_factor_secret',
                'two_factor_confirmed_at',
                'two_factor_recovery_codes',
                'last_login_at',
            ]);
        });
    }
};
