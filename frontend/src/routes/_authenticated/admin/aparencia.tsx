import { createFileRoute } from "@tanstack/solid-router";
import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import { For, Show, createResource, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/aparencia")({
  head: () =>
    seoHead({
      title: "Banners, Home e Páginas — Admin Mistura Feminina",
      description:
        "Edição visual de banners, blocos da home e páginas institucionais.",
      path: "/admin/aparencia",
      noindex: true,
    }),
  component: AdminAppearancePage,
});

interface AdminBanner {
  id: number;
  title: string;
  placement: string;
  desktop_image_path: string;
  mobile_image_path: string | null;
  alt_text: string;
  cta_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface AdminHomeSection {
  id: number;
  key: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  config: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
}

interface AdminContentPage {
  id: number;
  title: string;
  slug: string;
  content_html: string;
  seo_title: string | null;
  is_published: boolean;
  show_in_footer: boolean;
  footer_group: string | null;
}

function AdminAppearancePage() {
  const [tab, setTab] = createSignal<"banners" | "home" | "paginas">("banners");
  const [bTitle, setBTitle] = createSignal("");
  const [bPlacement, setBPlacement] = createSignal("hero");
  const [bDesktop, setBDesktop] = createSignal("");
  const [bMobile, setBMobile] = createSignal("");
  const [bAlt, setBAlt] = createSignal("");
  const [bUrl, setBUrl] = createSignal("/promocoes");

  const [sectionsDraft, setSectionsDraft] = createSignal<AdminHomeSection[]>(
    [],
  );
  const [editingPage, setEditingPage] = createSignal<AdminContentPage | null>(
    null,
  );
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [banners, { refetch: refetchBanners }] = createResource(async () => {
    const res = await api<{ data: AdminBanner[] }>("/admin/banners");
    return res.data ?? [];
  });

  const [sections, { refetch: refetchSections }] = createResource(async () => {
    const res = await api<{ data: AdminHomeSection[] }>("/admin/home-sections");
    const list = res.data ?? [];
    setSectionsDraft(list);
    return list;
  });

  const [pages, { refetch: refetchPages }] = createResource(async () => {
    const res = await api<{ data: AdminContentPage[] }>("/admin/pages");
    return res.data ?? [];
  });

  async function uploadBannerImg(file: File, setter: (v: string) => void) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "banners");
    const res = await api<{ data: { path: string } }>("/admin/media/upload", {
      method: "POST",
      body: fd,
    });
    setter(res.data.path);
  }

  async function createBanner(e: Event) {
    e.preventDefault();
    setFeedback(null);
    try {
      await api("/admin/banners", {
        method: "POST",
        body: {
          title: bTitle().trim(),
          placement: bPlacement(),
          desktop_image_path: bDesktop().trim(),
          mobile_image_path: bMobile().trim() || undefined,
          alt_text: bAlt().trim() || bTitle().trim(),
          cta_url: bUrl().trim() || undefined,
          is_active: true,
        },
      });
      setBTitle("");
      setBDesktop("");
      setBMobile("");
      setBAlt("");
      await refetchBanners();
      setFeedback("Banner publicado.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao cadastrar banner.",
      );
    }
  }

  async function deleteBanner(id: number) {
    await api(`/admin/banners/${id}`, { method: "DELETE" });
    await refetchBanners();
  }

  function moveSection(index: number, delta: number) {
    const list = [...sectionsDraft()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    if (!item) return;
    list.splice(target, 0, item);
    setSectionsDraft(list.map((s, idx) => ({ ...s, sort_order: idx + 1 })));
  }

  async function saveSections() {
    setFeedback(null);
    try {
      await api("/admin/home-sections", {
        method: "PUT",
        body: {
          sections: sectionsDraft().map((s, idx) => ({
            id: s.id,
            title: s.title,
            subtitle: s.subtitle,
            config: s.config ?? {},
            sort_order: idx + 1,
            is_active: s.is_active,
          })),
        },
      });
      await refetchSections();
      setFeedback("Ordem e seções da Home atualizadas na loja.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar seções.",
      );
    }
  }

  async function savePage(e: Event) {
    e.preventDefault();
    const p = editingPage();
    if (!p) return;
    setFeedback(null);
    try {
      await api(`/admin/pages/${p.id}`, {
        method: "PUT",
        body: {
          title: p.title,
          slug: p.slug,
          content_html: p.content_html,
          seo_title: p.seo_title,
          is_published: p.is_published,
          show_in_footer: p.show_in_footer,
          footer_group: p.footer_group,
        },
      });
      await refetchPages();
      setEditingPage(null);
      setFeedback("Página institucional atualizada.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar página.",
      );
    }
  }

  return (
    <AdminLayout
      title="Banners, Home e Páginas"
      subtitle="Controle os banners da vitrine, ordem da página inicial e páginas institucionais"
      permission="content.view"
    >
      <div class="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("banners")}
          class={`rounded-lg px-4 py-2 text-xs font-bold ${tab() === "banners" ? "bg-[var(--mf-primary)] text-white" : "border border-zinc-300 bg-white"}`}
        >
          Banners
        </button>
        <button
          type="button"
          onClick={() => setTab("home")}
          class={`rounded-lg px-4 py-2 text-xs font-bold ${tab() === "home" ? "bg-[var(--mf-primary)] text-white" : "border border-zinc-300 bg-white"}`}
        >
          Blocos da Home
        </button>
        <button
          type="button"
          onClick={() => setTab("paginas")}
          class={`rounded-lg px-4 py-2 text-xs font-bold ${tab() === "paginas" ? "bg-[var(--mf-primary)] text-white" : "border border-zinc-300 bg-white"}`}
        >
          Páginas Institucionais
        </button>
      </div>

      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <Show when={tab() === "banners"}>
        <div class="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={createBanner}
            class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5"
          >
            <h2 class="text-base font-bold text-zinc-900">Novo Banner</h2>
            <input
              type="text"
              required
              placeholder="Título interno *"
              value={bTitle()}
              onInput={(e) => setBTitle(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
            />
            <select
              value={bPlacement()}
              onChange={(e) => setBPlacement(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
            >
              <option value="hero">Hero Principal (Topo)</option>
              <option value="promo_grid">Grade Promocional</option>
              <option value="category_top">Topo de Categoria</option>
            </select>
            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Arte Desktop *
              </label>
              <input
                type="text"
                required
                placeholder="/storage/banners/..."
                value={bDesktop()}
                onInput={(e) => setBDesktop(e.currentTarget.value)}
                class="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) void uploadBannerImg(f, setBDesktop);
                }}
                class="mt-1 text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-zinc-700">
                Arte Mobile (opcional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) void uploadBannerImg(f, setBMobile);
                }}
                class="mt-1 text-xs"
              />
            </div>
            <input
              type="text"
              placeholder="Texto alternativo (acessibilidade)"
              value={bAlt()}
              onInput={(e) => setBAlt(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <input
              type="text"
              placeholder="Link de destino (ex.: /promocoes)"
              value={bUrl()}
              onInput={(e) => setBUrl(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs"
            />
            <button
              type="submit"
              class="h-10 w-full rounded-lg bg-[var(--mf-primary)] text-xs font-bold text-white"
            >
              Publicar Banner
            </button>
          </form>

          <section class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
            <h2 class="text-base font-bold text-zinc-900">Banners Atuais</h2>
            <For each={banners() ?? []}>
              {(b) => (
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3">
                  <div class="flex items-center gap-3">
                    <img
                      src={assetUrl(b.desktop_image_path)}
                      alt={b.alt_text}
                      class="h-14 w-28 rounded border border-zinc-200 object-cover"
                    />
                    <div>
                      <p class="text-sm font-bold text-zinc-900">{b.title}</p>
                      <p class="text-xs text-zinc-500">
                        Posição: {b.placement} · {b.cta_url || "Sem link"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteBanner(b.id)}
                    class="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              )}
            </For>
          </section>
        </div>
      </Show>

      <Show when={tab() === "home"}>
        <Show when={!sections.loading}>
          <div class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-bold text-zinc-900">
                Construtor da Página Inicial
              </h2>
              <button
                type="button"
                onClick={() => void saveSections()}
                class="rounded-lg bg-[var(--mf-primary)] px-4 py-2 text-xs font-bold text-white"
              >
                Salvar ordem e títulos
              </button>
            </div>
            <For each={sectionsDraft()}>
              {(sec, idx) => (
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div class="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={sec.is_active}
                      onChange={(e) => {
                        const next = [...sectionsDraft()];
                        next[idx()] = {
                          ...sec,
                          is_active: e.currentTarget.checked,
                        };
                        setSectionsDraft(next);
                      }}
                    />
                    <div>
                      <p class="font-bold text-zinc-900">{sec.type}</p>
                      <input
                        type="text"
                        value={sec.title ?? ""}
                        placeholder="Título da seção"
                        onInput={(e) => {
                          const next = [...sectionsDraft()];
                          next[idx()] = {
                            ...sec,
                            title: e.currentTarget.value,
                          };
                          setSectionsDraft(next);
                        }}
                        class="mt-1 h-8 rounded border border-zinc-300 bg-white px-2 text-xs"
                      />
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveSection(idx(), -1)}
                      aria-label="Mover para cima"
                      class="rounded border border-zinc-300 bg-white p-1.5"
                    >
                      <ArrowUp class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(idx(), 1)}
                      aria-label="Mover para baixo"
                      class="rounded border border-zinc-300 bg-white p-1.5"
                    >
                      <ArrowDown class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={tab() === "paginas"}>
        <div class="grid gap-6 lg:grid-cols-12">
          <ul class="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white lg:col-span-4">
            <For each={pages() ?? []}>
              {(p) => (
                <li class="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p class="font-bold text-zinc-900">{p.title}</p>
                    <p class="text-xs text-zinc-500">/{p.slug}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPage({ ...p })}
                    class="rounded border border-zinc-300 px-3 py-1 text-xs font-semibold"
                  >
                    Editar
                  </button>
                </li>
              )}
            </For>
          </ul>

          <div class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-8">
            <Show
              when={editingPage()}
              fallback={
                <p class="text-sm text-zinc-500">
                  Selecione uma página institucional para editar seu texto.
                </p>
              }
            >
              {(ep) => (
                <form onSubmit={savePage} class="space-y-3 text-sm">
                  <h2 class="text-base font-bold text-zinc-900">
                    Editando: {ep().title}
                  </h2>
                  <input
                    type="text"
                    required
                    value={ep().title}
                    onInput={(e) =>
                      setEditingPage({ ...ep(), title: e.currentTarget.value })
                    }
                    class="h-10 w-full rounded-md border border-zinc-300 px-3"
                  />
                  <textarea
                    rows={10}
                    required
                    value={ep().content_html}
                    onInput={(e) =>
                      setEditingPage({
                        ...ep(),
                        content_html: e.currentTarget.value,
                      })
                    }
                    class="w-full rounded-md border border-zinc-300 p-3 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    class="rounded-lg bg-[var(--mf-primary)] px-5 py-2 text-xs font-bold text-white"
                  >
                    Salvar página
                  </button>
                </form>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </AdminLayout>
  );
}
