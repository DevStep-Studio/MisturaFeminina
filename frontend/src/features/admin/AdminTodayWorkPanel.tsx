import { Link } from "@tanstack/solid-router";
import AlertCircle from "lucide-solid/icons/circle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Clock from "lucide-solid/icons/clock";
import FileWarning from "lucide-solid/icons/file-exclamation-point";
import PackageX from "lucide-solid/icons/package-x";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Truck from "lucide-solid/icons/truck";
import { For, Show, createResource, createSignal } from "solid-js";
import { api } from "../../lib/api";

interface TodayWorkPayload {
  cards: {
    ship_today_count: number;
    order_issues_count: number;
    products_review_count: number;
    out_of_stock_variants_count: number;
  };
  tasks: Array<{
    id: number;
    title: string;
    description: string | null;
    task_type: string;
    priority: "urgent" | "high" | "normal" | "low";
    status: string;
    action_url: string | null;
    assigned_to: { id: number; name: string } | null;
    due_at: string | null;
    is_overdue: boolean;
  }>;
  out_of_stock_variants: Array<{
    id: number;
    product_id: number;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    pending_restock_count: number;
    last_movement_at: string | null;
  }>;
  generated_at: string;
}

interface StaffOption {
  id: number;
  name: string;
}

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  normal: "bg-purple-100 text-[#93509e] border-purple-200",
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  normal: "Normal",
  low: "Baixa",
};

export function AdminTodayWorkPanel(props: { onDataChanged?: () => void }) {
  const [scope, setScope] = createSignal("all");
  const [priorityFilter, setPriorityFilter] = createSignal("");
  const [showOosList, setShowOosList] = createSignal(false);
  const [showNewTask, setShowNewTask] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal("");
  const [newPriority, setNewPriority] = createSignal("normal");
  const [newAssignee, setNewAssignee] = createSignal("");

  const [today, { refetch }] = createResource(
    () => ({ scope: scope(), priority: priorityFilter() }),
    async (f) => {
      const qs = new URLSearchParams();
      if (f.scope) qs.set("scope", f.scope);
      if (f.priority) qs.set("priority", f.priority);
      const res = await api<{ data: TodayWorkPayload }>(
        `/admin/today-work?${qs.toString()}`,
      );
      return res.data;
    },
  );

  const [staff] = createResource(async () => {
    const res = await api<{ data: StaffOption[] }>("/admin/team-members");
    return res.data ?? [];
  });

  async function toggleTaskComplete(taskId: number, currentStatus: string) {
    const next = currentStatus === "completed" ? "pending" : "completed";
    await api(`/admin/operational-tasks/${taskId}`, {
      method: "PATCH",
      body: { status: next },
    });
    await refetch();
    props.onDataChanged?.();
  }

  async function assignTask(taskId: number, userIdStr: string) {
    await api(`/admin/operational-tasks/${taskId}`, {
      method: "PATCH",
      body: {
        assigned_to_user_id: userIdStr ? Number(userIdStr) : null,
      },
    });
    await refetch();
  }

  async function createTask(e: Event) {
    e.preventDefault();
    if (!newTitle().trim()) return;
    await api("/admin/operational-tasks", {
      method: "POST",
      body: {
        title: newTitle().trim(),
        priority: newPriority(),
        assigned_to_user_id: newAssignee() ? Number(newAssignee()) : null,
      },
    });
    setNewTitle("");
    setShowNewTask(false);
    await refetch();
  }

  return (
    <section
      aria-label="Trabalho de Hoje"
      class="space-y-4 rounded-2xl border border-[#DFC2E3] bg-gradient-to-br from-[#FCF8FD] via-white to-[#F9F4FB] p-4 shadow-xs sm:p-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-black tracking-tight text-[#2E0C49] sm:text-xl">
            Trabalho de Hoje
          </h2>
          <p class="text-xs text-[#5B486B]">
            Acompanhe as prioridades e pendências da operação.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DFC2E3] bg-white px-3 text-xs font-bold text-[#93509e] hover:bg-[#FCF8FD]"
        >
          <RefreshCw class="size-3.5" />
          Atualizar filas
        </button>
      </div>

      {/* 4 Cards Operacionais Reais */}
      <Show when={today()}>
        {(d) => (
          <>
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Link
                to="/admin/pedidos"
                search={{ filter: "ship_today" } as Record<string, string>}
                class="group flex items-center justify-between rounded-xl border border-emerald-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-sm"
              >
                <div>
                  <p class="text-2xl font-black text-zinc-900">
                    {d().cards.ship_today_count}{" "}
                    <span class="text-sm font-bold text-zinc-500">pedidos</span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-emerald-700">
                    Para postar hoje →
                  </p>
                </div>
                <span class="rounded-full bg-emerald-50 p-2.5 text-emerald-700 group-hover:bg-emerald-100">
                  <Truck class="size-5" />
                </span>
              </Link>

              <Link
                to="/admin/pedidos"
                search={{ filter: "issues" } as Record<string, string>}
                class="group flex items-center justify-between rounded-xl border border-red-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-red-400 hover:shadow-sm"
              >
                <div>
                  <p class="text-2xl font-black text-zinc-900">
                    {d().cards.order_issues_count}{" "}
                    <span class="text-sm font-bold text-zinc-500">pedidos</span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-red-700">
                    Com problemas →
                  </p>
                </div>
                <span class="rounded-full bg-red-50 p-2.5 text-red-600 group-hover:bg-red-100">
                  <AlertCircle class="size-5" />
                </span>
              </Link>

              <Link
                to="/admin/produtos"
                search={{ filter: "needs_review" } as Record<string, string>}
                class="group flex items-center justify-between rounded-xl border border-amber-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-sm"
              >
                <div>
                  <p class="text-2xl font-black text-zinc-900">
                    {d().cards.products_review_count}{" "}
                    <span class="text-sm font-bold text-zinc-500">
                      produtos
                    </span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-amber-800">
                    Aguardando revisão →
                  </p>
                </div>
                <span class="rounded-full bg-amber-50 p-2.5 text-amber-700 group-hover:bg-amber-100">
                  <FileWarning class="size-5" />
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setShowOosList((prev) => !prev)}
                class="group flex items-center justify-between rounded-xl border border-[#DFC2E3] bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#93509e] hover:shadow-sm"
              >
                <div>
                  <p class="text-2xl font-black text-[#93509e]">
                    {d().cards.out_of_stock_variants_count}{" "}
                    <span class="text-sm font-bold text-zinc-500">SKUs</span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-[#93509e]">
                    Variações sem estoque {showOosList() ? "▲" : "▼"}
                  </p>
                </div>
                <span class="rounded-full bg-[#F3E2F6] p-2.5 text-[#93509e] group-hover:bg-[#E7C6ED]">
                  <PackageX class="size-5" />
                </span>
              </button>
            </div>

            {/* Drill-down de Variacoes sem Estoque */}
            <Show when={showOosList()}>
              <div class="rounded-xl border border-[#DFC2E3] bg-white p-4">
                <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <h3 class="text-xs font-extrabold uppercase tracking-wide text-[#2E0C49]">
                    SKUs Ativos sem Estoque Disponível
                  </h3>
                  <Link
                    to="/admin/produtos"
                    search={
                      { filter: "out_of_stock_variants" } as Record<
                        string,
                        string
                      >
                    }
                    class="text-xs font-bold text-[#93509e] hover:underline"
                  >
                    Abrir no Catálogo →
                  </Link>
                </div>
                <Show
                  when={d().out_of_stock_variants.length > 0}
                  fallback={
                    <p class="text-xs text-zinc-500">
                      Nenhuma variação esgotada no momento.
                    </p>
                  }
                >
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                      <thead class="border-b border-zinc-100 text-zinc-400">
                        <tr>
                          <th class="py-2 pr-3">Produto / Tonalidade</th>
                          <th class="py-2 pr-3">SKU</th>
                          <th class="py-2 pr-3 text-right">Avise-me</th>
                          <th class="py-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-100">
                        <For each={d().out_of_stock_variants}>
                          {(item) => (
                            <tr>
                              <td class="py-2 pr-3">
                                <p class="font-bold text-zinc-900">
                                  {item.product_name}
                                </p>
                                <p class="text-[11px] text-zinc-500">
                                  {item.variant_name}
                                  <Show when={item.shade_code}>
                                    {" "}
                                    ({item.shade_code})
                                  </Show>
                                </p>
                              </td>
                              <td class="py-2 pr-3 font-mono text-[11px] text-zinc-700">
                                {item.sku}
                              </td>
                              <td class="py-2 pr-3 text-right">
                                <Show
                                  when={item.pending_restock_count > 0}
                                  fallback={
                                    <span class="text-zinc-400">0</span>
                                  }
                                >
                                  <span class="rounded-full bg-[#F3E2F6] px-2 py-0.5 font-bold text-[#93509e]">
                                    {item.pending_restock_count} esperando
                                  </span>
                                </Show>
                              </td>
                              <td class="py-2 text-right">
                                <Link
                                  to="/admin/produtos"
                                  search={
                                    {
                                      tab: "recebimentos",
                                      sku: item.sku,
                                    } as Record<string, string>
                                  }
                                  class="inline-flex rounded-md bg-[#93509e] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
                                >
                                  Registrar recebimento
                                </Link>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Proximas Acoes — Fila Priorizada */}
            <div class="rounded-xl border border-zinc-200/80 bg-white p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-extrabold text-zinc-900">
                    Próximas ações
                  </h3>
                  <p class="text-[11px] text-zinc-500">
                    Tarefas priorizadas por prazo operacional e ocorrências
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <For
                    each={
                      [
                        ["all", "Todas"],
                        ["mine", "Minhas pendências"],
                        ["unassigned", "Sem responsável"],
                        ["overdue", "Em atraso"],
                        ["completed", "Concluídas"],
                      ] as const
                    }
                  >
                    {([key, label]) => (
                      <button
                        type="button"
                        onClick={() => setScope(key)}
                        class={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          scope() === key
                            ? "bg-[#93509e] text-white"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    )}
                  </For>

                  <select
                    value={priorityFilter()}
                    onChange={(e) => setPriorityFilter(e.currentTarget.value)}
                    aria-label="Filtrar por prioridade"
                    class="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold"
                  >
                    <option value="">Prioridade: Todas</option>
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="low">Baixa</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowNewTask((v) => !v)}
                    class="inline-flex h-7 items-center gap-1 rounded-lg border border-[#93509e] px-2.5 text-[11px] font-bold text-[#93509e] hover:bg-[#93509e] hover:text-white"
                  >
                    <Plus class="size-3" />
                    Nova tarefa
                  </button>
                </div>
              </div>

              <Show when={showNewTask()}>
                <form
                  onSubmit={(e) => void createTask(e)}
                  class="mb-3 grid gap-2 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] p-3 text-xs sm:grid-cols-12"
                >
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="Descreva a tarefa operacional..."
                    value={newTitle()}
                    onInput={(e) => setNewTitle(e.currentTarget.value)}
                    class="h-8 rounded border border-zinc-300 bg-white px-2.5 sm:col-span-6"
                  />
                  <select
                    value={newPriority()}
                    onChange={(e) => setNewPriority(e.currentTarget.value)}
                    class="h-8 rounded border border-zinc-300 bg-white px-2 sm:col-span-2"
                  >
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="low">Baixa</option>
                  </select>
                  <select
                    value={newAssignee()}
                    onChange={(e) => setNewAssignee(e.currentTarget.value)}
                    class="h-8 rounded border border-zinc-300 bg-white px-2 sm:col-span-2"
                  >
                    <option value="">Sem responsável</option>
                    <For each={staff() ?? []}>
                      {(u) => <option value={u.id}>{u.name}</option>}
                    </For>
                  </select>
                  <button
                    type="submit"
                    class="h-8 rounded bg-[#93509e] font-bold text-white hover:bg-[#7c3f87] sm:col-span-2"
                  >
                    Adicionar
                  </button>
                </form>
              </Show>

              <Show
                when={d().tasks.length > 0}
                fallback={
                  <div class="rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500">
                    Nenhuma pendência nesta fila. Operação em dia!
                  </div>
                }
              >
                <ul class="divide-y divide-zinc-100">
                  <For each={d().tasks}>
                    {(task) => (
                      <li class="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div class="flex min-w-0 flex-1 items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              void toggleTaskComplete(task.id, task.status)
                            }
                            aria-label={`Marcar tarefa ${task.title}`}
                            class={`mt-0.5 rounded-full p-0.5 transition-colors ${
                              task.status === "completed"
                                ? "text-emerald-600"
                                : "text-zinc-300 hover:text-[#93509e]"
                            }`}
                          >
                            <CheckCircle2 class="size-4" />
                          </button>

                          <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-1.5">
                              <span
                                class={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  PRIORITY_STYLE[task.priority] ??
                                  PRIORITY_STYLE.normal
                                }`}
                              >
                                {PRIORITY_LABEL[task.priority] ?? task.priority}
                              </span>
                              <p
                                class={`text-xs font-bold ${
                                  task.status === "completed"
                                    ? "text-zinc-400 line-through"
                                    : "text-zinc-900"
                                }`}
                              >
                                {task.title}
                              </p>
                              <Show when={task.is_overdue}>
                                <span class="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                  <Clock class="size-2.5" />
                                  Prazo vencido
                                </span>
                              </Show>
                            </div>
                            <Show when={task.description}>
                              <p class="mt-0.5 text-[11px] text-zinc-500">
                                {task.description}
                              </p>
                            </Show>
                          </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
                          <select
                            value={task.assigned_to?.id ?? ""}
                            onChange={(e) =>
                              void assignTask(task.id, e.currentTarget.value)
                            }
                            aria-label={`Responsável por ${task.title}`}
                            class="h-7 rounded border border-zinc-200 bg-zinc-50 px-2 text-[11px] text-zinc-700"
                          >
                            <option value="">Sem responsável</option>
                            <For each={staff() ?? []}>
                              {(u) => <option value={u.id}>{u.name}</option>}
                            </For>
                          </select>

                          <Show when={task.action_url}>
                            <a
                              href={task.action_url!}
                              class="rounded-md border border-[#DFC2E3] bg-[#FCF8FD] px-2.5 py-1 text-[11px] font-bold text-[#93509e] hover:bg-[#93509e] hover:text-white"
                            >
                              Abrir →
                            </a>
                          </Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}
