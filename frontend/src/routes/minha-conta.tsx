import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import Download from "lucide-solid/icons/download";
import Heart from "lucide-solid/icons/heart";
import LogOut from "lucide-solid/icons/log-out";
import MapPin from "lucide-solid/icons/map-pin";
import Package from "lucide-solid/icons/package";
import Shield from "lucide-solid/icons/shield";
import Trash2 from "lucide-solid/icons/trash";
import UserIcon from "lucide-solid/icons/user";
import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import { ProductCard } from "../features/storefront/components/ProductCard";
import { StoreShell } from "../features/storefront/components/StoreShell";
import { AccountRestockAlertsTab } from "../features/account/AccountRestockAlertsTab";
import type { ProductCardData } from "../features/storefront/types";
import { ApiError, api } from "../lib/api";
import {
  formatCep,
  formatCents,
  formatCpfCnpj,
  formatPhone,
  orderStatusLabel,
} from "../lib/format";
import { seoHead } from "../lib/seo";
import { getCurrentUser, logout } from "../security/auth";
import { hasPermission } from "../security/permissions";
import { session } from "../security/session";

export const Route = createFileRoute("/minha-conta")({
  head: () =>
    seoHead({
      title: "Minha Conta — Mistura Feminina Cosméticos",
      description:
        "Central do cliente: pedidos, endereços, favoritos e privacidade.",
      path: "/minha-conta",
      noindex: true,
    }),
  component: MyAccountPage,
});

interface OverviewPayload {
  user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    cpf_cnpj: string | null;
    two_factor_enabled: boolean;
  };
  orders: {
    id: number;
    order_number: string;
    public_token: string;
    status: string;
    total_cents: number;
    created_at: string;
  }[];
  addresses: {
    id: number;
    label: string;
    recipient_name: string;
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  }[];
  wishlist: ProductCardData[];
}

function MyAccountPage() {
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<
    "pedidos" | "enderecos" | "favoritos" | "dados" | "avisos" | "privacidade"
  >("pedidos");
  const [overview, setOverview] = createSignal<OverviewPayload | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [notice, setNotice] = createSignal<string | null>(null);

  // Profile fields
  const [profName, setProfName] = createSignal("");
  const [profPhone, setProfPhone] = createSignal("");
  const [profCpf, setProfCpf] = createSignal("");

  // New address fields
  const [addrLabel, setAddrLabel] = createSignal("Casa");
  const [addrRecip, setAddrRecip] = createSignal("");
  const [addrCep, setAddrCep] = createSignal("");
  const [addrStreet, setAddrStreet] = createSignal("");
  const [addrNum, setAddrNum] = createSignal("");
  const [addrNeigh, setAddrNeigh] = createSignal("");
  const [addrCity, setAddrCity] = createSignal("");
  const [addrUf, setAddrUf] = createSignal("");

  // LGPD & 2FA
  const [lgpdType, setLgpdType] = createSignal<
    "export" | "correction" | "deletion"
  >("export");
  const [lgpdDetails, setLgpdDetails] = createSignal("");
  const [mfaSetup, setMfaSetup] = createSignal<{
    secret: string;
    otpauth_uri: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = createSignal("");

  async function fetchOverview() {
    setLoading(true);
    try {
      const res = await api<{
        data: Partial<OverviewPayload> & {
          user: OverviewPayload["user"];
          recent_orders?: OverviewPayload["orders"];
        };
      }>("/account/overview");
      const data = res.data;
      setOverview({
        user: data.user,
        orders: Array.isArray(data.orders)
          ? data.orders
          : Array.isArray(data.recent_orders)
            ? data.recent_orders
            : [],
        addresses: Array.isArray(data.addresses) ? data.addresses : [],
        wishlist: Array.isArray(data.wishlist) ? data.wishlist : [],
      });
      setProfName(data.user.name);
      setProfPhone(formatPhone(data.user.phone || ""));
      setProfCpf(formatCpfCnpj(data.user.cpf_cnpj || ""));
      setAddrRecip(data.user.name);
    } catch {
      // handled via session redirect
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void getCurrentUser()
      .then((u) => {
        if (!u) {
          void navigate({
            to: "/entrar",
            search: { redirect: "/minha-conta" },
            replace: true,
          });
        } else {
          void fetchOverview();
        }
      })
      .catch(() => {
        void navigate({
          to: "/entrar",
          search: { redirect: "/minha-conta" },
          replace: true,
        });
      });
  });

  createEffect(() => {
    if (session.status() === "anonymous") {
      void navigate({
        to: "/entrar",
        search: { redirect: "/minha-conta" },
        replace: true,
      });
    }
  });

  async function saveProfile(e: Event) {
    e.preventDefault();
    setNotice(null);
    try {
      await api("/account/profile", {
        method: "PUT",
        body: {
          name: profName().trim(),
          phone: profPhone().trim() || undefined,
          cpf_cnpj: profCpf().trim() || undefined,
        },
      });
      await fetchOverview();
      setNotice("Dados cadastrais atualizados.");
    } catch (err) {
      setNotice(
        err instanceof ApiError ? err.message : "Erro ao atualizar dados.",
      );
    }
  }

  async function saveAddress(e: Event) {
    e.preventDefault();
    setNotice(null);
    try {
      await api("/account/addresses", {
        method: "POST",
        body: {
          label: addrLabel().trim(),
          recipient_name: addrRecip().trim(),
          cep: addrCep().replace(/\D/g, ""),
          street: addrStreet().trim(),
          number: addrNum().trim(),
          neighborhood: addrNeigh().trim(),
          city: addrCity().trim(),
          state: addrUf().trim().toUpperCase(),
        },
      });
      setAddrCep("");
      setAddrStreet("");
      setAddrNum("");
      setAddrNeigh("");
      setAddrCity("");
      setAddrUf("");
      await fetchOverview();
      setNotice("Endereço salvo na sua conta.");
    } catch (err) {
      setNotice(
        err instanceof ApiError
          ? err.message
          : "Verifique os campos do endereço.",
      );
    }
  }

  async function deleteAddress(id: number) {
    await api(`/account/addresses/${id}`, { method: "DELETE" });
    await fetchOverview();
  }

  async function exportLgpdData() {
    const res = await api<Record<string, unknown>>("/account/lgpd/export");
    const blob = new Blob([JSON.stringify(res, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meus-dados-lgpd.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitLgpdRequest(e: Event) {
    e.preventDefault();
    setNotice(null);
    try {
      await api("/account/lgpd/request", {
        method: "POST",
        body: { type: lgpdType(), details: lgpdDetails().trim() || undefined },
      });
      setLgpdDetails("");
      setNotice("Solicitação LGPD registrada com sucesso.");
    } catch (err) {
      setNotice(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar solicitação.",
      );
    }
  }

  async function start2fa() {
    const res = await api<{ data: { secret: string; otpauth_uri: string } }>(
      "/account/2fa/setup",
      {
        method: "POST",
      },
    );
    setMfaSetup(res.data);
  }

  async function confirm2fa(e: Event) {
    e.preventDefault();
    try {
      await api("/account/2fa/confirm", {
        method: "POST",
        body: { code: mfaCode().trim() },
      });
      setMfaSetup(null);
      setMfaCode("");
      await fetchOverview();
      setNotice("Autenticação em duas etapas ativada.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Código inválido.");
    }
  }

  async function handleLogout() {
    await logout();
    await navigate({ to: "/" });
  }

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <Show when={loading()}>
          <div class="h-64 animate-pulse rounded-2xl bg-zinc-100" />
        </Show>

        <Show when={!loading() && overview()}>
          {(ov) => (
            <div class="space-y-6">
              <header class="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
                <div class="flex items-center gap-3.5">
                  <img
                    src="/logo-mf.png"
                    alt=""
                    aria-hidden="true"
                    class="h-10 w-auto shrink-0 object-contain"
                  />
                  <div>
                    <h1 class="text-2xl font-bold text-zinc-900">
                      Olá, {ov().user.name}
                    </h1>
                    <p class="text-sm text-zinc-600">{ov().user.email}</p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <Show
                    when={hasPermission(
                      session.user()?.permissions ?? [],
                      "dashboard.view",
                    )}
                  >
                    <Link
                      to="/admin"
                      class="rounded-lg bg-[#93509e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7c3f87]"
                    >
                      Acessar Backoffice (/admin)
                    </Link>
                  </Show>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    class="inline-flex items-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-4 py-2 text-xs font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                  >
                    <LogOut class="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </header>

              <Show when={notice()}>
                <p
                  role="status"
                  class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
                >
                  {notice()}
                </p>
              </Show>

              <div class="grid gap-6 lg:grid-cols-12">
                <nav
                  aria-label="Menu da minha conta"
                  class="space-y-1 lg:col-span-3"
                >
                  <button
                    type="button"
                    onClick={() => setTab("pedidos")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "pedidos"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <Package class="h-4 w-4" />
                    Meus Pedidos ({ov().orders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("enderecos")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "enderecos"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <MapPin class="h-4 w-4" />
                    Endereços ({ov().addresses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("favoritos")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "favoritos"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <Heart class="h-4 w-4" />
                    Favoritos ({ov().wishlist.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("dados")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "dados"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <UserIcon class="h-4 w-4" />
                    Dados e 2FA
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("avisos")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "avisos"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <Heart class="h-4 w-4" />
                    Meus Avisos de Estoque
                  </button>
                  <Link
                    to="/minha-reposicao"
                    class="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold text-[#93509e] hover:bg-[#FCF8FD]"
                  >
                    <Package class="h-4 w-4" />
                    Minha Lista de Reposição →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTab("privacidade")}
                    class={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
                      tab() === "privacidade"
                        ? "bg-[var(--mf-primary)] text-white"
                        : "text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    <Shield class="h-4 w-4" />
                    Privacidade (LGPD)
                  </button>
                </nav>

                <div class="lg:col-span-9">
                  <Show when={tab() === "pedidos"}>
                    <section class="rounded-xl border border-zinc-200 bg-white p-5">
                      <h2 class="text-lg font-bold text-zinc-900">
                        Histórico de Pedidos
                      </h2>
                      <Show
                        when={ov().orders.length > 0}
                        fallback={
                          <p class="mt-3 text-sm text-zinc-600">
                            Você ainda não realizou pedidos.
                          </p>
                        }
                      >
                        <ul class="mt-4 divide-y divide-zinc-200">
                          <For each={ov().orders}>
                            {(ord) => (
                              <li class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                                <div>
                                  <p class="font-bold text-zinc-900">
                                    {ord.order_number}
                                  </p>
                                  <p class="text-xs text-zinc-500">
                                    Status: {orderStatusLabel(ord.status)}
                                  </p>
                                </div>
                                <div class="flex items-center gap-4">
                                  <span class="font-bold text-zinc-900">
                                    {formatCents(ord.total_cents)}
                                  </span>
                                  <Link
                                    to="/pedido/$token/confirmacao"
                                    params={{ token: ord.public_token }}
                                    class="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  >
                                    Ver detalhes
                                  </Link>
                                </div>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </section>
                  </Show>

                  <Show when={tab() === "enderecos"}>
                    <div class="space-y-6">
                      <div class="grid gap-3 sm:grid-cols-2">
                        <For each={ov().addresses}>
                          {(addr) => (
                            <div class="flex items-start justify-between rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                              <div>
                                <p class="font-bold text-zinc-900">
                                  {addr.label}
                                </p>
                                <p class="text-zinc-700">
                                  {addr.street}, {addr.number}
                                </p>
                                <p class="text-xs text-zinc-500">
                                  {addr.neighborhood} · {addr.city}/{addr.state}{" "}
                                  · CEP {formatCep(addr.cep)}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Remover endereço"
                                onClick={() => void deleteAddress(addr.id)}
                                class="text-zinc-400 hover:text-red-700"
                              >
                                <Trash2 class="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </For>
                      </div>

                      <form
                        onSubmit={saveAddress}
                        class="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5 sm:grid-cols-3"
                      >
                        <h3 class="sm:col-span-3 text-sm font-bold text-zinc-900">
                          Novo endereço
                        </h3>
                        <input
                          type="text"
                          required
                          placeholder="Apelido (ex.: Casa)"
                          value={addrLabel()}
                          onInput={(e) => setAddrLabel(e.currentTarget.value)}
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Destinatário"
                          value={addrRecip()}
                          onInput={(e) => setAddrRecip(e.currentTarget.value)}
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="CEP"
                          value={addrCep()}
                          onInput={(e) =>
                            setAddrCep(formatCep(e.currentTarget.value))
                          }
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Rua / Avenida"
                          value={addrStreet()}
                          onInput={(e) => setAddrStreet(e.currentTarget.value)}
                          class="sm:col-span-2 h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Número"
                          value={addrNum()}
                          onInput={(e) => setAddrNum(e.currentTarget.value)}
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Bairro"
                          value={addrNeigh()}
                          onInput={(e) => setAddrNeigh(e.currentTarget.value)}
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Cidade"
                          value={addrCity()}
                          onInput={(e) => setAddrCity(e.currentTarget.value)}
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        />
                        <input
                          type="text"
                          required
                          maxLength={2}
                          placeholder="UF (SP)"
                          value={addrUf()}
                          onInput={(e) =>
                            setAddrUf(e.currentTarget.value.toUpperCase())
                          }
                          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm uppercase"
                        />
                        <button
                          type="submit"
                          class="sm:col-span-3 h-10 rounded-lg bg-[var(--mf-primary)] text-xs font-bold text-white"
                        >
                          Salvar endereço
                        </button>
                      </form>
                    </div>
                  </Show>

                  <Show when={tab() === "favoritos"}>
                    <Show
                      when={ov().wishlist.length > 0}
                      fallback={
                        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
                          Você ainda não salvou produtos nos favoritos.
                        </div>
                      }
                    >
                      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <For each={ov().wishlist}>
                          {(p) => <ProductCard product={p} />}
                        </For>
                      </div>
                    </Show>
                  </Show>

                  <Show when={tab() === "dados"}>
                    <div class="space-y-6">
                      <form
                        onSubmit={saveProfile}
                        class="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2"
                      >
                        <div class="sm:col-span-2 flex items-center justify-between gap-3">
                          <h2 class="text-base font-bold text-zinc-900">
                            Dados pessoais
                          </h2>
                          <img
                            src="/logo-mf.png"
                            alt=""
                            aria-hidden="true"
                            class="h-6 w-auto object-contain opacity-85"
                          />
                        </div>
                        <div>
                          <label class="block text-xs font-semibold text-zinc-700">
                            Nome
                          </label>
                          <input
                            type="text"
                            required
                            value={profName()}
                            onInput={(e) => setProfName(e.currentTarget.value)}
                            class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
                          />
                        </div>
                        <div>
                          <label class="block text-xs font-semibold text-zinc-700">
                            WhatsApp
                          </label>
                          <input
                            type="text"
                            value={profPhone()}
                            onInput={(e) =>
                              setProfPhone(formatPhone(e.currentTarget.value))
                            }
                            class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
                          />
                        </div>
                        <div>
                          <label class="block text-xs font-semibold text-zinc-700">
                            CPF / CNPJ
                          </label>
                          <input
                            type="text"
                            value={profCpf()}
                            onInput={(e) =>
                              setProfCpf(formatCpfCnpj(e.currentTarget.value))
                            }
                            class="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
                          />
                        </div>
                        <div class="sm:col-span-2">
                          <button
                            type="submit"
                            class="rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-xs font-bold text-white"
                          >
                            Salvar alterações
                          </button>
                        </div>
                      </form>

                      <div class="rounded-xl border border-zinc-200 bg-white p-5">
                        <h3 class="text-base font-bold text-zinc-900">
                          Autenticação em duas etapas (2FA)
                        </h3>
                        <p class="mt-1 text-xs text-zinc-600">
                          Status atual:{" "}
                          <strong>
                            {ov().user.two_factor_enabled ? "Ativo" : "Inativo"}
                          </strong>
                        </p>
                        <Show
                          when={!ov().user.two_factor_enabled && !mfaSetup()}
                        >
                          <button
                            type="button"
                            onClick={() => void start2fa()}
                            class="mt-3 rounded-lg border border-[#93509e] bg-white px-4 py-2 text-xs font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                          >
                            Configurar TOTP (Google Authenticator)
                          </button>
                        </Show>
                        <Show when={mfaSetup()}>
                          {(setup) => (
                            <form
                              onSubmit={confirm2fa}
                              class="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs"
                            >
                              <p>
                                Chave manual:{" "}
                                <code class="font-bold">{setup().secret}</code>
                              </p>
                              <div class="flex gap-2">
                                <input
                                  type="text"
                                  required
                                  placeholder="Código 6 dígitos"
                                  value={mfaCode()}
                                  onInput={(e) =>
                                    setMfaCode(e.currentTarget.value)
                                  }
                                  class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                                />
                                <button
                                  type="submit"
                                  class="h-9 rounded-lg bg-[#93509e] px-4 font-semibold text-white transition-colors hover:bg-[#7c3f87]"
                                >
                                  Ativar 2FA
                                </button>
                              </div>
                            </form>
                          )}
                        </Show>
                      </div>
                    </div>
                  </Show>

                  <Show when={tab() === "avisos"}>
                    <AccountRestockAlertsTab />
                  </Show>

                  <Show when={tab() === "privacidade"}>
                    <div class="space-y-6 rounded-xl border border-zinc-200 bg-white p-5">
                      <div>
                        <h2 class="text-base font-bold text-zinc-900">
                          Seus direitos pela LGPD
                        </h2>
                        <p class="mt-1 text-xs text-zinc-600">
                          Exporte seus dados cadastrais em JSON ou envie uma
                          solicitação formal para nossa equipe.
                        </p>
                        <button
                          type="button"
                          onClick={() => void exportLgpdData()}
                          class="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#93509e] bg-white px-4 py-2 text-xs font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white"
                        >
                          <Download class="h-4 w-4" />
                          Baixar meus dados (JSON)
                        </button>
                      </div>

                      <form
                        onSubmit={submitLgpdRequest}
                        class="space-y-3 border-t border-zinc-200 pt-4"
                      >
                        <h3 class="text-sm font-bold text-zinc-900">
                          Nova solicitação LGPD
                        </h3>
                        <select
                          value={lgpdType()}
                          onChange={(e) =>
                            setLgpdType(
                              e.currentTarget.value as
                                "export" | "correction" | "deletion",
                            )
                          }
                          class="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                        >
                          <option value="export">
                            Portabilidade / Cópia de dados
                          </option>
                          <option value="correction">Correção de dados</option>
                          <option value="deletion">
                            Exclusão / Anonimização
                          </option>
                        </select>
                        <textarea
                          rows={2}
                          placeholder="Detalhes adicionais..."
                          value={lgpdDetails()}
                          onInput={(e) => setLgpdDetails(e.currentTarget.value)}
                          class="w-full rounded-md border border-zinc-300 p-2.5 text-sm"
                        />
                        <button
                          type="submit"
                          class="rounded-lg bg-[#93509e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7c3f87]"
                        >
                          Enviar solicitação
                        </button>
                      </form>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          )}
        </Show>
      </div>
    </StoreShell>
  );
}
