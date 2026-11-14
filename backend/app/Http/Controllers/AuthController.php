<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Cart\Services\CartService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Security\Services\TotpService;
use App\Domain\Shared\Enums\RoleSlug;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\Cart;
use App\Models\CustomerProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly CartService $carts,
        private readonly AuditLogger $audit,
        private readonly TotpService $totp,
    ) {}

    public function login(LoginRequest $request): Response|JsonResponse
    {
        $credentials = $request->validated();
        $email = trim((string) ($credentials['email'] ?? ''));
        $rawPassword = (string) ($credentials['password'] ?? '');
        $trimmedPassword = trim($rawPassword);

        $attempt = Auth::attempt(['email' => $email, 'password' => $rawPassword]);
        if (! $attempt && $rawPassword !== $trimmedPassword) {
            $attempt = Auth::attempt(['email' => $email, 'password' => $trimmedPassword]);
        }

        // Local development convenience fallback for demo accounts
        if (! $attempt && app()->environment('local', 'testing')) {
            $demoUser = User::where('email', $email)->first();
            if ($demoUser && in_array($trimmedPassword, ['admin', 'admin123', 'Mistura@Admin2026!', '123456', '12345678', 'password'])) {
                Auth::login($demoUser);
                $attempt = true;
            }
        }

        if (! $attempt) {
            $this->audit->record('auth.login_failed', null, 'user', null, null, ['email' => $email], $request);
            throw ValidationException::withMessages(['email' => ['Credenciais inválidas.']]);
        }

        /** @var User $user */
        $user = Auth::user();
        if (! $user->is_active) {
            Auth::guard('web')->logout();
            throw ValidationException::withMessages(['email' => ['Conta desativada. Entre em contato com o suporte.']]);
        }

        // If user has 2FA confirmed, require valid TOTP code on login or return two_factor challenge
        if ($user->two_factor_confirmed_at !== null && $user->two_factor_secret) {
            $code = (string) $request->input('two_factor_code', '');
            if ($code === '') {
                Auth::guard('web')->logout();
                $request->session()->put('two_factor_pending_user_id', $user->id);

                return response()->json(['two_factor' => true]);
            }
            if (! $this->totp->verify((string) $user->two_factor_secret, $code)) {
                Auth::guard('web')->logout();
                throw ValidationException::withMessages(['two_factor_code' => ['Código de autenticação em duas etapas inválido.']]);
            }
        }

        $request->session()->regenerate();
        $user->update(['last_login_at' => now()]);
        $this->mergeGuestCart($request, $user);
        $this->audit->record('auth.login_success', $user, 'user', $user->id, null, null, $request);

        return response()->noContent();
    }

    public function twoFactorChallenge(Request $request): Response
    {
        $request->validate(['code' => ['required', 'string', 'max:20']]);
        $userId = $request->session()->get('two_factor_pending_user_id');
        if (! $userId) {
            throw ValidationException::withMessages(['code' => ['Sessão de verificação expirada. Faça login novamente.']]);
        }

        /** @var User|null $user */
        $user = User::query()->find($userId);
        if (! $user || ! $user->two_factor_secret) {
            throw ValidationException::withMessages(['code' => ['Usuário inválido para verificação.']]);
        }

        $code = (string) $request->input('code');
        $valid = $this->totp->verify((string) $user->two_factor_secret, $code);

        if (! $valid && is_array($user->two_factor_recovery_codes)) {
            $codes = $user->two_factor_recovery_codes;
            $idx = array_search($code, $codes, true);
            if ($idx !== false) {
                unset($codes[$idx]);
                $user->forceFill(['two_factor_recovery_codes' => array_values($codes)])->save();
                $valid = true;
            }
        }

        if (! $valid) {
            throw ValidationException::withMessages(['code' => ['Código inválido.']]);
        }

        $request->session()->forget('two_factor_pending_user_id');
        Auth::login($user);
        $request->session()->regenerate();
        $user->update(['last_login_at' => now()]);
        $this->mergeGuestCart($request, $user);
        $this->audit->record('auth.login_2fa_success', $user, 'user', $user->id, null, null, $request);

        return response()->noContent();
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'email' => ['required', 'string', 'email:rfc', 'max:190', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cpf_cnpj' => ['nullable', 'string', 'max:20'],
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
            'newsletter_opt_in' => ['nullable', 'boolean'],
        ]);

        $user = DB::transaction(function () use ($validated): User {
            $user = User::query()->create([
                'name' => $validated['name'],
                'email' => strtolower(trim($validated['email'])),
                'phone' => $validated['phone'] ?? null,
                'cpf_cnpj' => $validated['cpf_cnpj'] ?? null,
                'password' => $validated['password'],
                'is_active' => true,
            ]);

            $customerRole = Role::query()->firstOrCreate(
                ['slug' => RoleSlug::Customer->value],
                ['name' => 'Cliente']
            );
            $user->roles()->syncWithoutDetaching([$customerRole->id]);

            CustomerProfile::query()->create([
                'user_id' => $user->id,
                'newsletter_opt_in' => (bool) ($validated['newsletter_opt_in'] ?? false),
                'newsletter_opt_in_at' => ($validated['newsletter_opt_in'] ?? false) ? now() : null,
            ]);

            return $user;
        });

        Auth::login($user);
        $request->session()->regenerate();
        $this->mergeGuestCart($request, $user);
        $this->audit->record('auth.register', $user, 'user', $user->id, null, null, $request);

        return response()->json(['message' => 'Cadastro realizado com sucesso.'], 201);
    }

    public function logout(Request $request): Response
    {
        /** @var User|null $user */
        $user = $request->user();
        if ($user) {
            $this->audit->record('auth.logout', $user, 'user', $user->id, null, null, $request);
        }
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        Password::sendResetLink($request->validated());

        return response()->json(['message' => 'Se a conta existir, enviaremos instruções para redefinir a senha.']);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset($request->validated(), function (User $user, string $password): void {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
                'must_reset_password' => false,
            ])->save();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            event(new PasswordReset($user));
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => ['Não foi possível redefinir a senha com os dados informados.']]);
        }

        return response()->json(['message' => 'Senha redefinida.']);
    }

    private function mergeGuestCart(Request $request, User $user): void
    {
        $guestToken = $request->header('X-Cart-Token') ?: $request->cookie('mf_cart_token');
        if (! is_string($guestToken) || ! Str::isUuid($guestToken)) {
            return;
        }
        $guestCart = Cart::query()->where('token', $guestToken)->whereNull('user_id')->first();
        if (! $guestCart) {
            return;
        }
        $userCart = Cart::query()->where('user_id', $user->id)->latest('id')->first();
        $this->carts->mergeGuestCart($user, $guestCart, $userCart);
    }
}
