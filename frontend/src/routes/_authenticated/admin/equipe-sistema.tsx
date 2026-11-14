import { createFileRoute } from "@tanstack/solid-router";
import MessageCircle from "lucide-solid/icons/message-circle";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import ShieldCheck from "lucide-solid/icons/shield-check";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import UserPlus from "lucide-solid/icons/user-plus";
import Users from "lucide-solid/icons/users";
import X from "lucide-solid/icons/x";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { formatCents, formatDate } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/equipe-sistema")({
  head: () =>
    seoHead({
      title: "Clientes, Usuários e Saúde — Admin Mistura Feminina",
      description:
        "Gestão completa de usuários, equipe, perfis RBAC, LGPD e saúde do sistema.",
      path: "/admin/equipe-sistema",
      noindex: true,
    }),
  component: AdminSystemPage,
});

interface UserRole {
  id: number;
  slug: string;
  name: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  cpf_cnpj: string | null;
  is_active: boolean;
  orders_count?: number;
  roles?: UserRole[];
  last_login_at?: string | null;
  created_at?: string;
  addresses?: {
    id: number;
    street: string;
    number: string;
    city: string;
    state: string;
    cep: string;
  }[];
  orders?: {
    id: number;
    order_number: string;
    total_cents: number;
    status: string;
    created_at: string;
  }[];
}

interface LgpdRow {
  id: number;
  type: string;
  status: string;
  details: string | null;
  user?: { name: string; email: string } | null;
  created_at: string;
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

const ROLE_OPTIONS = [
  {
    slug: "customer",
    name: "Cliente",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    slug: "superadmin",
    name: "Superadministrador",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    slug: "marketing",
    name: "Marketing & Conteúdo",
    badgeClass: "bg-pink-50 text-pink-700 border-pink-200",
  },
  {
    slug: "support",
    name: "Atendimento ao Cliente",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    slug: "fulfillment",
    name: "Expedição & Logística",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    slug: "finance",
    name: "Financeiro",
    badgeClass: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  {
    slug: "catalog",
    name: "Catálogo & Estoque",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
];

function getRoleBadge(roles?: UserRole[]) {
  const slug = roles?.[0]?.slug || "customer";
  const item = ROLE_OPTIONS.find((r) => r.slug === slug);
  return {
    name: item?.name || roles?.[0]?.name || "Cliente",
    badgeClass: item?.badgeClass || "bg-zinc-100 text-zinc-700 border-zinc-200",
  };
}

function AdminSystemPage() {
  const [tab, setTab] = createSignal<"usuarios" | "lgpd" | "saude">("usuarios");
  const [search, setSearch] = createSignal("");
  const [roleFilter, setRoleFilter] = createSignal("all");
  const [feedback, setFeedback] = createSignal<string | null>(null);

  // Modals
  const [editingUser, setEditingUser] = createSignal<UserRow | null>(null);
  const [showNewUserModal, setShowNewUserModal] = createSignal(false);
  const [viewingOrdersUser, setViewingOrdersUser] =
    createSignal<UserRow | null>(null);

  // Edit form fields
  const [editName, setEditName] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");
  const [editPhone, setEditPhone] = createSignal("");
  const [editCpf, setEditCpf] = createSignal("");
  const [editRole, setEditRole] = createSignal("customer");
  const [editIsActive, setEditIsActive] = createSignal(true);
  const [editPassword, setEditPassword] = createSignal("");

  // New user form fields
  const [newName, setNewName] = createSignal("");
  const [newEmail, setNewEmail] = createSignal("");
  const [newPhone, setNewPhone] = createSignal("");
  const [newCpf, setNewCpf] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [newRole, setNewRole] = createSignal("customer");
  const [newIsActive, setNewIsActive] = createSignal(true);

  // Resources
  const [users, { refetch: refetchUsers }] = createResource(
    () => ({ q: search(), role: roleFilter() }),
    async ({ q, role }) => {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (role && role !== "all") params.set("role", role);
      else params.set("role", "all");
      const res = await api<{ data: UserRow[] }>(
        `/admin/customers?${params.toString()}`,
      );
      return res.data ?? [];
    },
  );

  const [lgpdRequests, { refetch: refetchLgpd }] = createResource(async () => {
    const res = await api<{ data: LgpdRow[] }>("/admin/lgpd-requests");
    return res.data ?? [];
  });

  const [health, { refetch: refetchHealth }] = createResource(async () => {
    const res = await api<{ data: SystemHealth }>("/admin/system/health");
    return res.data;
  });

  function openEditModal(u: UserRow) {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPhone(u.phone || "");
    setEditCpf(u.cpf_cnpj || "");
    setEditRole(u.roles?.[0]?.slug || "customer");
    setEditIsActive(u.is_active);
    setEditPassword("");
  }

  async function openUserDetails(u: UserRow) {
    try {
      const res = await api<{ data: UserRow }>(`/admin/customers/${u.id}`);
      setViewingOrdersUser(res.data);
    } catch {
      setViewingOrdersUser(u);
    }
  }

  async function handleUpdateUser(e: Event) {
    e.preventDefault();
    const u = editingUser();
    if (!u) return;
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        name: editName().trim(),
        email: editEmail().trim().toLowerCase(),
        phone: editPhone().trim() || null,
        cpf_cnpj: editCpf().trim() || null,
        role_slug: editRole(),
        is_active: editIsActive(),
      };
      if (editPassword().trim()) {
        payload.password = editPassword().trim();
      }
      await api(`/admin/users/${u.id}`, {
        method: "PUT",
        body: payload,
      });
      setFeedback(`Usuário "${editName()}" atualizado com sucesso.`);
      setEditingUser(null);
      await refetchUsers();
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao atualizar usuário.",
      );
    }
  }

  async function handleCreateUser(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/users", {
        method: "POST",
        body: {
          name: newName().trim(),
          email: newEmail().trim().toLowerCase(),
          phone: newPhone().trim() || null,
          cpf_cnpj: newCpf().trim() || null,
          password: newPassword().trim(),
          role_slug: newRole(),
          is_active: newIsActive(),
        },
      });
      setFeedback(`Novo usuário "${newName()}" cadastrado com sucesso.`);
      setShowNewUserModal(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewCpf("");
      setNewPassword("");
      await refetchUsers();
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao cadastrar usuário.",
      );
    }
  }

  async function toggleUserStatus(u: UserRow) {
    setFeedback(null);
    try {
      await api(`/admin/users/${u.id}`, {
        method: "PUT",
        body: { is_active: !u.is_active },
      });
      setFeedback(
        `Status de "${u.name}" alterado para ${!u.is_active ? "Ativo" : "Inativo"}.`,
      );
      await refetchUsers();
    } catch (err) {
      setFeedback(
        err instanceof ApiError
          ? err.message
          : "Erro ao alterar status do usuário.",
      );
    }
  }

  async function processLgpd(id: number, status: "completed" | "rejected") {
    await api(`/admin/lgpd-requests/${id}`, {
      method: "PATCH",
      body: { status },
    });
    await refetchLgpd();
    setFeedback(`Solicitação LGPD #${id} marcada como ${status}.`);
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
      title="Gestão de Usuários, Clientes e Sistema"
      subtitle="Cadastre novos usuários, edite permissões RBAC, atenda LGPD e monitore o servidor"
      permission="customers.view"
    >
      {/* Navigation Tabs */}
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("usuarios")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "usuarios"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Users class="size-3.5" aria-hidden="true" />
            <span>Usuários & Clientes</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("lgpd")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "lgpd"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <ShieldCheck class="size-3.5" aria-hidden="true" />
            <span>
              Solicitações LGPD (
              {lgpdRequests()?.filter((r) => r.status === "pending").length ??
                0}
              )
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("saude")}
            class={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
              tab() === "saude"
                ? "bg-[var(--mf-primary)] text-white shadow-sm"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <RefreshCw class="size-3.5" aria-hidden="true" />
            <span>Saúde Técnica & Backups</span>
          </button>
        </div>

        <Show when={tab() === "usuarios"}>
          <button
            type="button"
            onClick={() => setShowNewUserModal(true)}
            class="inline-flex items-center gap-2 rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--mf-primary-hover)]"
          >
            <UserPlus class="size-4" aria-hidden="true" />
            <span>Novo Usuário / Equipe</span>
          </button>
        </Show>
      </div>

      <Show when={feedback()}>
        <div
          role="status"
          class="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
        >
          <span>{feedback()}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            class="text-emerald-700 hover:text-emerald-900"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </Show>

      {/* TAB 1: USUÁRIOS & CLIENTES */}
      <Show when={tab() === "usuarios"}>
        <div class="space-y-4">
          {/* Filters Bar */}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div class="relative min-w-[280px] flex-1">
              <Search
                class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Buscar por nome, e-mail ou telefone..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="h-9 w-full rounded-lg border border-zinc-300 pl-9 pr-3 text-sm focus:border-[var(--mf-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--mf-primary)]"
              />
            </div>

            <div class="flex items-center gap-2">
              <label
                for="filter-role"
                class="text-xs font-semibold text-zinc-600"
              >
                Papel:
              </label>
              <select
                id="filter-role"
                value={roleFilter()}
                onChange={(e) => setRoleFilter(e.currentTarget.value)}
                class="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-800"
              >
                <option value="all">Todos os Papéis</option>
                <For each={ROLE_OPTIONS}>
                  {(r) => <option value={r.slug}>{r.name}</option>}
                </For>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th class="px-4 py-3">Usuário</th>
                    <th class="px-4 py-3">Contato</th>
                    <th class="px-4 py-3">Cargo / Papel</th>
                    <th class="px-4 py-3">Pedidos</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For
                    each={users() ?? []}
                    fallback={
                      <tr>
                        <td
                          colspan={6}
                          class="py-8 text-center text-sm text-zinc-500"
                        >
                          Nenhum usuário encontrado com os filtros atuais.
                        </td>
                      </tr>
                    }
                  >
                    {(u) => {
                      const badge = getRoleBadge(u.roles);
                      return (
                        <tr class="hover:bg-zinc-50/70">
                          <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                              <span class="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-200 bg-[#FAF5FB] text-xs font-bold text-[#93509e]">
                                {u.name.slice(0, 2).toUpperCase()}
                              </span>
                              <div class="min-w-0">
                                <p class="font-bold text-zinc-900">{u.name}</p>
                                <p class="text-xs text-zinc-500">ID #{u.id}</p>
                              </div>
                            </div>
                          </td>
                          <td class="px-4 py-3">
                            <p class="text-xs text-zinc-800">{u.email}</p>
                            <Show when={u.phone}>
                              <p class="flex items-center gap-1 text-xs text-zinc-500">
                                <MessageCircle
                                  class="size-3 text-emerald-600"
                                  aria-hidden="true"
                                />
                                <span>{u.phone}</span>
                              </p>
                            </Show>
                          </td>
                          <td class="px-4 py-3">
                            <span
                              class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.badgeClass}`}
                            >
                              {badge.name}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void openUserDetails(u)}
                              class="inline-flex items-center gap-1 font-semibold text-zinc-700 hover:text-[var(--mf-primary)]"
                            >
                              <ShoppingBag
                                class="size-3.5"
                                aria-hidden="true"
                              />
                              <span>{u.orders_count ?? 0} pedidos</span>
                            </button>
                          </td>
                          <td class="px-4 py-3">
                            <span
                              class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                u.is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              <span
                                class={`size-1.5 rounded-full ${u.is_active ? "bg-emerald-600" : "bg-red-600"}`}
                              />
                              {u.is_active ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td class="px-4 py-3 text-right">
                            <div class="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(u)}
                                class="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleUserStatus(u)}
                                class={`rounded-md px-2 py-1 text-xs font-bold transition ${
                                  u.is_active
                                    ? "text-red-700 hover:bg-red-50"
                                    : "text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {u.is_active ? "Desativar" : "Ativar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Show>

      {/* TAB 2: SOLICITAÇÕES LGPD */}
      <Show when={tab() === "lgpd"}>
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 text-base font-bold text-zinc-900">
            Solicitações LGPD Recebidas
          </h2>
          <Show
            when={(lgpdRequests()?.length ?? 0) > 0}
            fallback={
              <p class="py-6 text-center text-sm text-zinc-500">
                Nenhuma solicitação LGPD registrada.
              </p>
            }
          >
            <ul class="divide-y divide-zinc-100 text-sm">
              <For each={lgpdRequests() ?? []}>
                {(req) => (
                  <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p class="font-bold text-zinc-900">
                        {req.user?.name || "Cliente"} · Tipo:{" "}
                        <span class="uppercase text-[var(--mf-primary)]">
                          {req.type}
                        </span>
                      </p>
                      <p class="text-xs text-zinc-500">
                        {req.user?.email} · Criado em{" "}
                        {formatDate(req.created_at)}
                      </p>
                      <Show when={req.details}>
                        <p class="mt-1 text-xs text-zinc-600 bg-zinc-50 p-1.5 rounded">
                          {req.details}
                        </p>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <span
                        class={`rounded px-2 py-0.5 text-xs font-semibold ${
                          req.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : req.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {req.status}
                      </span>
                      <Show when={req.status === "pending"}>
                        <div class="flex gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              void processLgpd(req.id, "completed")
                            }
                            class="rounded bg-emerald-700 px-2.5 py-1 font-semibold text-white hover:bg-emerald-800"
                          >
                            Atender
                          </button>
                          <button
                            type="button"
                            onClick={() => void processLgpd(req.id, "rejected")}
                            class="rounded bg-red-700 px-2.5 py-1 font-semibold text-white hover:bg-red-800"
                          >
                            Rejeitar
                          </button>
                        </div>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>

      {/* TAB 3: SAÚDE TÉCNICA E BACKUPS */}
      <Show when={tab() === "saude"}>
        <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <div class="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <h2 class="text-base font-bold text-zinc-900">
                Saúde Técnica e Infraestrutura
              </h2>
              <p class="text-xs text-zinc-500">
                Monitoramento da stack de backend, filas e banco de dados
              </p>
            </div>
            <button
              type="button"
              onClick={() => void runBackup()}
              class="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-zinc-800"
            >
              <RefreshCw class="size-3.5" aria-hidden="true" />
              <span>Gerar Backup Agora</span>
            </button>
          </div>

          <Show when={health()}>
            {(h) => (
              <div class="space-y-4 text-xs">
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p class="text-zinc-500">Versão PHP</p>
                    <p class="text-sm font-bold text-zinc-900">
                      {h().php_version}
                    </p>
                  </div>
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p class="text-zinc-500">Versão Laravel</p>
                    <p class="text-sm font-bold text-zinc-900">
                      {h().laravel_version}
                    </p>
                  </div>
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p class="text-zinc-500">Banco de Dados</p>
                    <p class="text-sm font-bold text-zinc-900">
                      {h().db_connection}
                    </p>
                  </div>
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p class="text-zinc-500">Total de Pedidos</p>
                    <p class="text-sm font-bold text-zinc-900">
                      {h().orders_total}
                    </p>
                  </div>
                </div>

                <div class="rounded-lg border border-zinc-200 p-4">
                  <h3 class="font-bold text-zinc-900">
                    Backups Gerados ({h().backups.length})
                  </h3>
                  <ul class="mt-2 divide-y divide-zinc-100">
                    <For each={h().backups}>
                      {(b) => (
                        <li class="flex items-center justify-between py-2 text-xs">
                          <span class="font-medium text-zinc-800">
                            {b.name}
                          </span>
                          <span class="text-zinc-500">
                            {Math.round(b.size_bytes / 1024)} KB ·{" "}
                            {formatDate(b.modified_at)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </div>
            )}
          </Show>
        </section>
      </Show>

      {/* MODAL: EDITAR USUÁRIO */}
      <Show when={editingUser()}>
        {(u) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
              <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 class="text-base font-bold text-zinc-900">
                  Editar Usuário #{u().id}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  class="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
                >
                  <X class="size-5" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} class="mt-4 space-y-3 text-sm">
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName()}
                    onInput={(e) => setEditName(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label class="block text-xs font-semibold text-zinc-700">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      value={editEmail()}
                      onInput={(e) => setEditEmail(e.currentTarget.value)}
                      class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-zinc-700">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      placeholder="(11) 99999-9999"
                      value={editPhone()}
                      onInput={(e) => setEditPhone(e.currentTarget.value)}
                      class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                    />
                  </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label class="block text-xs font-semibold text-zinc-700">
                      CPF / CNPJ
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={editCpf()}
                      onInput={(e) => setEditCpf(e.currentTarget.value)}
                      class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-zinc-700">
                      Papel / Cargo no Sistema
                    </label>
                    <select
                      value={editRole()}
                      onChange={(e) => setEditRole(e.currentTarget.value)}
                      class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                    >
                      <For each={ROLE_OPTIONS}>
                        {(r) => <option value={r.slug}>{r.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>

                <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <label class="block text-xs font-semibold text-zinc-700">
                    Redefinir Senha (opcional)
                  </label>
                  <p class="text-xs text-zinc-500">
                    Deixe em branco para manter a senha atual inalterada.
                  </p>
                  <input
                    type="password"
                    placeholder="Nova senha (mínimo 8 caracteres)"
                    value={editPassword()}
                    onInput={(e) => setEditPassword(e.currentTarget.value)}
                    class="mt-1.5 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                  />
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="edit-is-active"
                    checked={editIsActive()}
                    onChange={(e) => setEditIsActive(e.currentTarget.checked)}
                    class="rounded border-zinc-300 text-[var(--mf-primary)]"
                  />
                  <label
                    for="edit-is-active"
                    class="text-xs font-semibold text-zinc-800"
                  >
                    Conta Ativa (permite login e finalização de compras)
                  </label>
                </div>

                <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    class="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    class="rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--mf-primary-hover)]"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Show>

      {/* MODAL: NOVO USUÁRIO / MEMBRO DA EQUIPE */}
      <Show when={showNewUserModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 class="text-base font-bold text-zinc-900">
                Novo Usuário / Membro da Equipe
              </h3>
              <button
                type="button"
                onClick={() => setShowNewUserModal(false)}
                class="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
              >
                <X class="size-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} class="mt-4 space-y-3 text-sm">
              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex.: Ana Beatriz Silva"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="email@exemplo.com"
                    value={newEmail()}
                    onInput={(e) => setNewEmail(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={newPhone()}
                    onInput={(e) => setNewPhone(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={newCpf()}
                    onInput={(e) => setNewCpf(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-zinc-700">
                    Papel / Cargo *
                  </label>
                  <select
                    value={newRole()}
                    onChange={(e) => setNewRole(e.currentTarget.value)}
                    class="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                  >
                    <For each={ROLE_OPTIONS}>
                      {(r) => <option value={r.slug}>{r.name}</option>}
                    </For>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-700">
                  Senha Inicial *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={newPassword()}
                  onInput={(e) => setNewPassword(e.currentTarget.value)}
                  class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
                />
              </div>

              <div class="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="new-is-active"
                  checked={newIsActive()}
                  onChange={(e) => setNewIsActive(e.currentTarget.checked)}
                  class="rounded border-zinc-300 text-[var(--mf-primary)]"
                />
                <label
                  for="new-is-active"
                  class="text-xs font-semibold text-zinc-800"
                >
                  Conta Ativa imediatamente
                </label>
              </div>

              <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  class="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  class="rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--mf-primary-hover)]"
                >
                  Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* MODAL: VER PEDIDOS DO CLIENTE */}
      <Show when={viewingOrdersUser()}>
        {(u) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
              <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 class="text-base font-bold text-zinc-900">
                    Histórico de Pedidos de {u().name}
                  </h3>
                  <p class="text-xs text-zinc-500">{u().email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingOrdersUser(null)}
                  class="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100"
                >
                  <X class="size-5" aria-hidden="true" />
                </button>
              </div>

              <div class="mt-4 space-y-2">
                <Show
                  when={(u().orders?.length ?? 0) > 0}
                  fallback={
                    <p class="py-8 text-center text-sm text-zinc-500">
                      Este cliente ainda não realizou pedidos.
                    </p>
                  }
                >
                  <For each={u().orders ?? []}>
                    {(order) => (
                      <div class="flex items-center justify-between rounded-lg border border-zinc-200 p-3 text-xs">
                        <div>
                          <p class="font-bold text-zinc-900">
                            Pedido #{order.order_number}
                          </p>
                          <p class="text-zinc-500">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                        <div class="text-right">
                          <p class="font-bold text-zinc-900">
                            {formatCents(order.total_cents)}
                          </p>
                          <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                            {order.status}
                          </span>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>

              <div class="mt-4 flex justify-end border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  onClick={() => setViewingOrdersUser(null)}
                  class="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </AdminLayout>
  );
}
