<?php

use App\Support\Monitoring\SanitizeSentry;

return ['dsn' => env('SENTRY_LARAVEL_DSN'), 'environment' => env('APP_ENV'), 'release' => env('SENTRY_RELEASE'), 'send_default_pii' => false, 'traces_sample_rate' => 0.0, 'before_send' => [SanitizeSentry::class, 'event']];
