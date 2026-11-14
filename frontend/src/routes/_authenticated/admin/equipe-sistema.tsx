import { createFileRoute } from "@tanstack/solid-router";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/equipe-sistema")({
  head: () =>
    seoHead({
      title: "Clientes, Equipe e Saúde — Admin Mistura Feminina",
      description:
        "Gestão de clientes, LGPD, perfis RBAC, auditoria e backups.",
      path: "/admin/equipe-sistema",
      noindex: true,
    }),
  component: AdminSystemPage,
});

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  orders_count: number;
}

interface LgpdRow {
  id: number;
  type: string;
  status: string;
  details: string | null;
  user?: { name: string; email: string } | null;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  roles: { slug: string; name: string }[];
}

interface RoleItem {
  id: number;
  slug: string;
  name: string;
}

interface SystemHealth {
  php_version: string;
  laravel_version: string;
  environment: string;
  db_connection: string;
  queue_connection: string;
  failed_jobs_count: number;
  pending_jobs_count: number;
  orders_total: number;
  backups: { name: string; size_bytes: number; modified_at: string }[];
}

function AdminSystemPage() {
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [customers] = createResource(async () => {
    const res = await api<{ data: CustomerRow[] }>("/admin/customers");
    return res.data ?? [];
  });

  const [lgpdRequests, { refetch: refetchLgpd }] = createResource(async () => {
    const res = await api<{ data: LgpdRow[] }>("/admin/lgpd-requests");
    return res.data ?? [];
  });

  const [team, { refetch: refetchTeam }] = createResource(async () => {
    const res = await api<{
      data: { members: TeamMember[]; roles: RoleItem[] };
    }>("/admin/team");
    return res.data;
  });

  const [health, { refetch: refetchHealth }] = createResource(async () => {
    const res = await api<{ data: SystemHealth }>("/admin/system/health");
    return res.data;
  });

  async function processLgpd(id: number, status: "completed" | "rejected") {
    await api(`/admin/lgpd-requests/${id}`, {
      method: "PATCH",
      body: { status },
    });
    await refetchLgpd();
    setFeedback(`Solicitação LGPD #${id} marcada como ${status}.`);
  }

  async function changeRole(userId: number, roleSlug: string) {
    try {
      await api(`/admin/team/${userId}/role`, {
        method: "PATCH",
        body: { role_slug: roleSlug },
      });
      await refetchTeam();
      setFeedback("Permissão da equipe atualizada.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao atualizar cargo.",
      );
    }
  }

  async function runBackup() {
    setFeedback(null);
    const res = await api<{ data: { message: string } }>(
      "/admin/system/backup",
      { method: "POST" },
    );
    await refetchHealth();
    setFeedback(res.data.message || "Backup concluído.");
  }

  return (
    <AdminLayout
      title="Clientes, Equipe, LGPD e Saúde"
      subtitle="Controle de acessos RBAC, atendimento LGPD, fila e backups"
      permission="customers.view"
    >
      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Clientes Cadastrados ({customers()?.length ?? 0})
          </h2>
          <ul class="divide-y divide-zinc-100 text-sm">
            <For each={customers() ?? []}>
              {(c) => (
                <li class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="font-semibold text-zinc-900">{c.name}</p>
                    <p class="text-xs text-zinc-500">{c.email}</p>
                  </div>
                  <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold">
                    {c.orders_count} pedidos
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Solicitações LGPD
          </h2>
          <Show
            when={(lgpdRequests()?.length ?? 0) > 0}
            fallback={
              <p class="text-sm text-zinc-500">
                Nenhuma solicitação LGPD pendente.
              </p>
            }
          >
            <ul class="divide-y divide-zinc-100 text-sm">
              <For each={lgpdRequests() ?? []}>
                {(req) => (
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p class="font-bold text-zinc-900">
                        {req.user?.name || "Cliente"} · {req.type}
                      </p>
                      <p class="text-xs text-zinc-500">Status: {req.status}</p>
                    </div>
                    <Show when={req.status === "pending"}>
                      <div class="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => void processLgpd(req.id, "completed")}
                          class="rounded bg-emerald-700 px-2.5 py-1 font-semibold text-white"
                        >
                          Concluir
                        </button>
                        <button
                          type="button"
                          onClick={() => void processLgpd(req.id, "rejected")}
                          class="rounded bg-red-700 px-2.5 py-1 font-semibold text-white"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Equipe e Papéis (RBAC)
          </h2>
          <Show when={team()}>
            {(t) => (
              <ul class="divide-y divide-zinc-100 text-sm">
                <For each={t().members}>
                  {(m) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <p class="font-semibold text-zinc-900">{m.name}</p>
                        <p class="text-xs text-zinc-500">{m.email}</p>
                      </div>
                      <select
                        value={m.roles[0]?.slug ?? ""}
                        onChange={(e) =>
                          void changeRole(m.id, e.currentTarget.value)
                        }
                        class="h-8 rounded border border-zinc-300 bg-white px-2 text-xs"
                      >
                        <For each={t().roles}>
                          {(r) => <option value={r.slug}>{r.name}</option>}
                        </For>
                      </select>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Show>
        </section>

        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-base font-bold text-zinc-900">
              Saúde Técnica e Backups
            </h2>
            <button
              type="button"
              onClick={() => void runBackup()}
              class="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              Gerar Backup Agora
            </button>
          </div>
          <Show when={health()}>
            {(h) => (
              <div class="space-y-3 text-xs">
                <div class="grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3">
                  <p>
                    <strong>PHP:</strong> {h().php_version}
                  </p>
                  <p>
                    <strong>Laravel:</strong> {h().laravel_version}
                  </p>
                  <p>
                    <strong>Banco:</strong> {h().db_connection}
                  </p>
                  <p>
                    <strong>Fila:</strong> {h().queue_connection} (
                    {h().pending_jobs_count} pend.)
                  </p>
                  <p>
                    <strong>Jobs com falha:</strong> {h().failed_jobs_count}
                  </p>
                  <p>
                    <strong>Total pedidos:</strong> {h().orders_total}
                  </p>
                </div>
                <p class="font-bold text-zinc-800">
                  Backups disponíveis ({h().backups.length}):
                </p>
                <ul class="max-h-32 divide-y divide-zinc-100 overflow-y-auto">
                  <For each={h().backups}>
                    {(b) => (
                      <li class="flex justify-between py-1">
                        <span>{b.name}</span>
                        <span class="text-zinc-500">
                          {Math.round(b.size_bytes / 1024)} KB
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </Show>
        </section>
      </div>
    </AdminLayout>
  );
}
