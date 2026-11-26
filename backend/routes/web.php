<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SeoController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/two-factor-challenge', [AuthController::class, 'twoFactorChallenge'])->middleware('throttle:login');
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:login');
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::post('/forgot-password', [AuthController::class, 'forgot'])->middleware('throttle:password');
Route::post('/reset-password', [AuthController::class, 'reset'])->middleware('throttle:password');

Route::get('/sitemap.xml', [SeoController::class, 'sitemap']);
Route::get('/robots.txt', [SeoController::class, 'robots']);
Route::get('/llms.txt', [SeoController::class, 'llms']);
Route::get('/merchant-feed.xml', [SeoController::class, 'merchantFeed']);
Route::get('/feed/google-merchant.xml', [SeoController::class, 'merchantFeed']);
