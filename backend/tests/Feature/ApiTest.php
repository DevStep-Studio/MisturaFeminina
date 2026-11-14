<?php

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\Notification;

it('requires a session and returns a request id', function () {
    $this->getJson('/api/v1/me')->assertUnauthorized()->assertHeader('X-Request-ID')->assertJsonStructure(['request_id']);
});
it('authenticates and logs out', function () {
    $user = User::factory()->create(['password' => 'Password123456']);
    $this->postJson('/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable();
    $this->postJson('/login', ['email' => $user->email, 'password' => 'Password123456'])->assertNoContent();
    $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonMissingPath('data.password');
    $this->postJson('/logout')->assertNoContent();
    app('auth')->forgetGuards();
    $this->getJson('/api/v1/me')->assertUnauthorized();
});
it('creates updates paginates and deletes owned projects', function () {
    $this->actingAs(User::factory()->create());
    $id = $this->postJson('/api/v1/projects', ['name' => 'Example'])->assertCreated()->assertJsonPath('data.status', 'planned')->json('data.id');
    $this->patchJson('/api/v1/projects/'.$id, ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active');
    $this->getJson('/api/v1/projects?per_page=1')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonStructure(['data', 'links', 'meta']);
    $this->getJson('/api/v1/projects/'.$id)->assertOk();
    $this->deleteJson('/api/v1/projects/'.$id)->assertNoContent();
    $this->getJson('/api/v1/projects/'.$id)->assertNotFound();
});
it('isolates projects and rejects protected fields', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $project = $owner->projects()->create(['name' => 'Private']);
    $this->actingAs($other);
    $this->getJson('/api/v1/projects')->assertJsonPath('meta.total', 0);
    foreach (['get', 'patch', 'delete'] as $method) {
        $this->{$method.'Json'}('/api/v1/projects/'.$project->id, [])->assertNotFound();
    }
    $this->postJson('/api/v1/projects', ['name' => 'Injected', 'user_id' => $owner->id])->assertUnprocessable();
    $this->postJson('/api/v1/projects', ['name' => str_repeat('a', 151), 'status' => 'invalid'])->assertUnprocessable();
    $this->getJson('/api/v1/projects?per_page=101')->assertUnprocessable();
});
it('limits repeated login attempts', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/login', ['email' => 'missing@example.com', 'password' => 'wrong'])->assertUnprocessable();
    }
    $this->postJson('/login', ['email' => 'missing@example.com', 'password' => 'wrong'])->assertStatus(429);
});
it('recovers passwords without revealing accounts', function () {
    Notification::fake();
    $user = User::factory()->create();
    $a = $this->postJson('/forgot-password', ['email' => $user->email])->assertOk()->json();
    $b = $this->postJson('/forgot-password', ['email' => 'absent@example.com'])->assertOk()->json();
    expect($a)->toBe($b);
    Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
        $this->postJson('/reset-password', ['token' => $notification->token, 'email' => $user->email, 'password' => 'NewPassword1234', 'password_confirmation' => 'NewPassword1234'])->assertOk();

        return true;
    });
});
it('permits only configured CORS origins', function () {
    $this->options('/api/v1/me', [], ['Origin' => 'http://localhost:3000', 'Access-Control-Request-Method' => 'GET'])->assertHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    $this->options('/api/v1/me', [], ['Origin' => 'https://evil.example', 'Access-Control-Request-Method' => 'GET'])->assertHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
});
it('enforces csrf outside the framework testing bypass', function () {
    $this->app->instance('env', 'local');
    $this->postJson('/login', ['email' => 'a@example.com', 'password' => 'wrong'])->assertStatus(419);
});
it('denies operational dashboards outside local', function () {
    $this->app->instance('env', 'production');
    $this->get('/horizon')->assertForbidden();
    $this->get('/docs/api')->assertForbidden();
});
