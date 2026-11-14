<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Projects\Actions\SaveProject;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexProjectRequest;
use App\Http\Requests\Api\V1\StoreProjectRequest;
use App\Http\Requests\Api\V1\UpdateProjectRequest;
use App\Http\Resources\Api\V1\ProjectResource;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ProjectController extends Controller
{
    public function index(IndexProjectRequest $request)
    {
        Gate::authorize('viewAny', Project::class);

        return ProjectResource::collection($request->user()->projects()->orderByDesc('id')->paginate($request->integer('per_page', 15)));
    }

    public function store(StoreProjectRequest $request, SaveProject $action)
    {
        Gate::authorize('create', Project::class);

        return (new ProjectResource($action->execute($request->user(), $request->validated())))->response()->setStatusCode(201);
    }

    private function owned(Request $request, string $project): Project
    {
        return $request->user()->projects()->findOrFail($project);
    }

    public function show(Request $request, string $project)
    {
        $model = $this->owned($request, $project);
        Gate::authorize('view', $model);

        return new ProjectResource($model);
    }

    public function update(UpdateProjectRequest $request, string $project, SaveProject $action)
    {
        $model = $this->owned($request, $project);
        Gate::authorize('update', $model);

        return new ProjectResource($action->execute($request->user(), $request->validated(), $model));
    }

    public function destroy(Request $request, string $project)
    {
        $model = $this->owned($request, $project);
        Gate::authorize('delete', $model);
        $model->delete();

        return response()->noContent();
    }
}
