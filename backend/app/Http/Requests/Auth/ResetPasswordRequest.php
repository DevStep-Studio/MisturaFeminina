<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['email' => ['required', 'email', 'max:254'], 'token' => ['required', 'string', 'max:255'], 'password' => ['required', 'confirmed', 'max:1024', Password::min(12)->mixedCase()->numbers()]];
    }
}
