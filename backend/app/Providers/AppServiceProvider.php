<?php

declare(strict_types=1);

namespace App\Providers;

use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(\App\Domain\Wholesale\Services\WholesalePricingService::class);
    }

    public function boot(): void
    {
        RateLimiter::for('api', fn ($r) => Limit::perMinute(180)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('public', fn ($r) => Limit::perMinute(180)->by($r->ip()));
        RateLimiter::for('checkout', fn ($r) => Limit::perMinute(20)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('webhook', fn ($r) => Limit::perMinute(120)->by($r->ip()));
        RateLimiter::for('login', fn ($r) => [Limit::perMinute(5)->by(strtolower((string) $r->input('email')).'|'.$r->ip()), Limit::perMinute(30)->by($r->ip())]);
        RateLimiter::for('password', fn ($r) => Limit::perMinute(3)->by($r->ip()));
        ResetPassword::createUrlUsing(fn ($user, string $token) => rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->email]));
        Scramble::configure()->withDocumentTransformers(function (OpenApi $api): void {
            $api->info->title = 'Mistura Feminina Cosméticos API';
        });
        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }
    }
}
