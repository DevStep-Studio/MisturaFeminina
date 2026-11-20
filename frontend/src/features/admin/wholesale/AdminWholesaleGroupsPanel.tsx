import { For, Show, createSignal, onMount } from "solid-js";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";

interface WholesaleGroupData {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  items_count?: number;
}

export function AdminWholesaleGroupsPanel() {
  const [groups, setGroups] = createSignal<WholesaleGroupData[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [form, setForm] = createSignal({
    name: "",
    description: "",
    status: "active",
  });

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: WholesaleGroupData[] }>(
        "/admin/wholesale/groups",
      );
      setGroups(res.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadGroups();
  });

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/wholesale/groups", form());
      setModalOpen(false);
      setForm({ name: "", description: "", status: "active" });
      void loadGroups();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deseja excluir este grupo comercial?")) return;
    try {
      await api.delete(`/admin/wholesale/groups/${id}`);
      void loadGroups();
    } catch {
      //
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Grupos Comerciais de Atacado
          </h2>
          <p class="text-xs text-zinc-500">
            Agrupe diferentes produtos ou linhas para que a quantidade de itens
            comprados some conjuntamente para desbloquear faixas de atacado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          class="inline-flex items-center gap-1.5 rounded-lg bg-[#93509e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
        >
          <Plus class="size-4" />
          <span>Novo Grupo</span>
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Show
          when={groups().length > 0}
          fallback={
            <div class="col-span-full rounded-xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
              {loading()
                ? "Carregando grupos..."
                : "Nenhum grupo comercial cadastrado."}
            </div>
          }
        >
          <For each={groups()}>
            {(grp) => (
              <div class="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-sm font-bold text-[#2E0C49]">{grp.name}</h3>
                    <p class="text-[11px] text-zinc-400 font-mono">
                      {grp.slug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(grp.id)}
                    class="rounded p-1 text-zinc-400 hover:text-red-600"
                    title="Excluir grupo"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
                <p class="mt-2 text-xs text-zinc-600 line-clamp-2">
                  {grp.description || "Sem descrição."}
                </p>
                <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                  <span>{grp.items_count ?? 0} produtos vinculados</span>
                  <span class="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                    {grp.status}
                  </span>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      <Show when={modalOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div class="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Fechar"
              class="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
            >
              <X class="size-5" />
            </button>
            <h3 class="text-base font-bold text-[#2E0C49]">
              Novo Grupo Comercial
            </h3>
            <form onSubmit={handleCreate} class="mt-4 space-y-3 text-xs">
              <div>
                <label class="block font-semibold text-zinc-700">
                  Nome do Grupo *
                </label>
                <input
                  type="text"
                  required
                  value={form().name}
                  onInput={(e) =>
                    setForm((f) => ({ ...f, name: e.currentTarget.value }))
                  }
                  class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  placeholder="Ex: Grupo Esmaltação em Gel"
                />
              </div>
              <div>
                <label class="block font-semibold text-zinc-700">
                  Descrição
                </label>
                <textarea
                  rows={2}
                  value={form().description}
                  onInput={(e) =>
                    setForm((f) => ({
                      ...f,
                      description: e.currentTarget.value,
                    }))
                  }
                  class="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs focus:border-[#93509e] focus:outline-none"
                  placeholder="Finalidade do agrupamento comercial..."
                />
              </div>
              <div class="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy()}
                  class="rounded-lg bg-[#93509e] px-5 py-2 font-bold text-white transition hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {busy() ? "Criando..." : "Criar Grupo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}
