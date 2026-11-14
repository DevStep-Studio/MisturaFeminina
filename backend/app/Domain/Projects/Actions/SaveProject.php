<?php

namespace App\Domain\Projects\Actions;

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SaveProject
{
    public function execute(User $user, array $data, ?Project $project = null): Project
    {
        return DB::transaction(function () use ($user, $data, $project) {
            $project ??= new Project;
            if (! $project->exists) {
                $project->user()->associate($user);
            }
            $project->fill($data)->save();

            return $project->refresh();
        });
    }
}
