<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'login', 'logout', 'register', 'two-factor-challenge', 'forgot-password', 'reset-password'],
    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_filter(explode(',', env('FRONTEND_URL', 'http://localhost:3000'))),
    'allowed_headers' => ['Accept', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-Request-ID', 'X-Cart-Token', 'X-Idempotency-Key'],
    'exposed_headers' => ['X-Request-ID', 'X-Cart-Token'],
    'max_age' => 600,
    'supports_credentials' => true,
];
