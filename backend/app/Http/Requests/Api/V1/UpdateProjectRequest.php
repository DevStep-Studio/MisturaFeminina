<?php

namespace App\Http\Requests\Api\V1;

use App\Domain\Projects\Enums\ProjectStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::enum(ProjectStatus::class)],
            'user_id' => ['prohibited'], 'id' => ['prohibited'], 'created_at' => ['prohibited'], 'updated_at' => ['prohibited'],
        ];
    }
}
