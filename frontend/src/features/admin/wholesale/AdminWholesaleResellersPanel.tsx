import { For, Show, createSignal, onMount } from "solid-js";
import Check from "lucide-solid/icons/check";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import UserX from "lucide-solid/icons/user-x";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";

interface ResellerMember {
  id: number;
  customer_group_id: number;
  user_id: number;
  status: "pending" | "approved" | "rejected" | "suspended";
  company_name: string | null;
  trade_name: string | null;
  cnpj_cpf: string | null;
  state_registration: string | null;
  phone: string | null;
  requested_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  group?: { name: string };
  user?: { name: string; email: string };
}

export function AdminWholesaleResellersPanel() {
  const [members, setMembers] = createSignal<ResellerMember[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [statusFilter, setStatusFilter] = createSignal<string>("all");
  const [actionMsg, setActionMsg] = createSignal<string | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ResellerMember[] }>(
        "/admin/wholesale/resellers",
        {
          status: statusFilter() !== "all" ? statusFilter() : undefined,
        },
      );
      setMembers(res.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadMembers();
  });

  const handleApprove = async (id: number) => {
    try {
      await api.post(`/admin/wholesale/resellers/${id}/approve`, {});
      setActionMsg("Revendedor aprovado com sucesso!");
      void loadMembers();
    } catch {
      setActionMsg("Erro ao aprovar revendedor.");
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt(
      "Informe o motivo da rejeição (opcional):",
      "Critérios não atendidos.",
    );
    if (reason === null) return;
    try {
      await api.post(`/admin/wholesale/resellers/${id}/reject`, { reason });
      setActionMsg("Solicitação rejeitada.");
      void loadMembers();
    } catch {
      setActionMsg("Erro ao rejeitar revendedor.");
    }
  };

  const handleSuspend = async (id: number) => {
    if (
      !confirm(
        "Deseja suspender o acesso deste revendedor às condições de atacado exclusivas?",
      )
    )
      return;
    try {
      await api.post(`/admin/wholesale/resellers/${id}/suspend`, {});
      setActionMsg("Revendedor suspenso.");
      void loadMembers();
    } catch {
      setActionMsg("Erro ao suspender revendedor.");
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      await api.post(`/admin/wholesale/resellers/${id}/reactivate`, {});
      setActionMsg("Revendedor reativado com sucesso!");
      void loadMembers();
    } catch {
      setActionMsg("Erro ao reativar revendedor.");
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-bold text-[#2E0C49]">
            Gerenciamento de Revendedores & Salões
          </h2>
          <p class="text-xs text-zinc-500">
            Aprove, rejeite ou suspenda cadastros de clientes que solicitam
            acesso ao atacado exclusivo.
          </p>
        </div>

        {/* Status Filter */}
        <div class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              void loadMembers();
            }}
            class={`rounded-md px-3 py-1.5 transition ${statusFilter() === "all" ? "bg-[#93509e] text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("pending");
              void loadMembers();
            }}
            class={`rounded-md px-3 py-1.5 transition ${statusFilter() === "pending" ? "bg-amber-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            Pendentes
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("approved");
              void loadMembers();
            }}
            class={`rounded-md px-3 py-1.5 transition ${statusFilter() === "approved" ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
          >
            Aprovados
          </button>
        </div>
      </div>

      <Show when={actionMsg()}>
        <div class="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs font-semibold text-purple-900">
          {actionMsg()}
        </div>
      </Show>

      {/* Table */}
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-zinc-200 bg-zinc-50 font-bold text-[#5B486B]">
            <tr>
              <th class="p-3.5">Cliente / Salão</th>
              <th class="p-3.5">Documento (CPF/CNPJ)</th>
              <th class="p-3.5">Contato</th>
              <th class="p-3.5">Data Solicitação</th>
              <th class="p-3.5">Status</th>
              <th class="p-3.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <Show
              when={members().length > 0}
              fallback={
                <tr>
                  <td colspan={6} class="p-8 text-center text-zinc-500">
                    {loading()
                      ? "Carregando cadastros..."
                      : "Nenhum revendedor encontrado neste filtro."}
                  </td>
                </tr>
              }
            >
              <For each={members()}>
                {(m) => (
                  <tr class="hover:bg-zinc-50/80">
                    <td class="p-3.5 font-bold text-[#2E0C49]">
                      {m.company_name || m.trade_name || m.user?.name}
                      <span class="block text-[11px] font-normal text-zinc-400">
                        {m.user?.email}
                      </span>
                    </td>
                    <td class="p-3.5 font-mono text-[11px] text-zinc-600">
                      {m.cnpj_cpf || "Não informado"}
                    </td>
                    <td class="p-3.5 text-zinc-600">{m.phone || "-"}</td>
                    <td class="p-3.5 text-zinc-500">
                      {m.requested_at
                        ? new Date(m.requested_at).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td class="p-3.5">
                      <span
                        class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          m.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : m.status === "suspended"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-red-100 text-red-800"
                        }`}
                      >
                        {m.status === "approved" && "Aprovado"}
                        {m.status === "pending" && "Pendente"}
                        {m.status === "suspended" && "Suspenso"}
                        {m.status === "rejected" && "Rejeitado"}
                      </span>
                    </td>
                    <td class="p-3.5 text-right">
                      <div class="inline-flex items-center gap-1.5">
                        <Show when={m.status === "pending"}>
                          <button
                            type="button"
                            onClick={() => void handleApprove(m.id)}
                            class="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                          >
                            <Check class="size-3" />
                            <span>Aprovar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReject(m.id)}
                            class="inline-flex items-center gap-1 rounded bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          >
                            <X class="size-3" />
                            <span>Rejeitar</span>
                          </button>
                        </Show>

                        <Show when={m.status === "approved"}>
                          <button
                            type="button"
                            onClick={() => void handleSuspend(m.id)}
                            class="inline-flex items-center gap-1 rounded bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
                          >
                            <UserX class="size-3" />
                            <span>Suspender</span>
                          </button>
                        </Show>

                        <Show
                          when={
                            m.status === "suspended" || m.status === "rejected"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => void handleReactivate(m.id)}
                            class="inline-flex items-center gap-1 rounded bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
                          >
                            <RotateCcw class="size-3" />
                            <span>Reativar</span>
                          </button>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  );
}
