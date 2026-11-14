<?php

use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Resources\Api\V1\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('me', fn (Request $request) => new UserResource($request->user()));
Route::apiResource('projects', ProjectController::class);
