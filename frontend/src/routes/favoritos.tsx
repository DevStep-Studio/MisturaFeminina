import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { For, Show, createResource, onMount } from "solid-js";
import { ProductCard } from "../features/storefront/components/ProductCard";
import { StoreShell } from "../features/storefront/components/StoreShell";
import type { ProductCardData } from "../features/storefront/types";
import { api } from "../lib/api";
import { seoHead } from "../lib/seo";
import { getCurrentUser } from "../security/auth";

export const Route = createFileRoute("/favoritos")({
  head: () =>
    seoHead({
      title: "Meus Favoritos — Mistura Feminina Cosméticos",
      description: "Lista de produtos favoritos salvos na sua conta.",
      path: "/favoritos",
      noindex: true,
    }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const navigate = useNavigate();

  onMount(() => {
    void getCurrentUser()
      .then((u) => {
        if (!u) {
          void navigate({
            to: "/entrar",
            search: { redirect: "/favoritos" },
            replace: true,
          });
        }
      })
      .catch(() => {
        void navigate({
          to: "/entrar",
          search: { redirect: "/favoritos" },
          replace: true,
        });
      });
  });

  const [items] = createResource(async () => {
    try {
      const res = await api<{ data: ProductCardData[] }>("/account/wishlist");
      return res.data ?? [];
    } catch {
      return [];
    }
  });

  return (
    <StoreShell>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <h1 class="text-2xl font-bold text-zinc-900">Meus Favoritos</h1>
        <Show
          when={!items.loading && (items()?.length ?? 0) > 0}
          fallback={
            <div class="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center">
              <p class="text-sm text-zinc-600">
                Nenhum produto salvo na sua lista de desejos ainda.
              </p>
              <Link
                to="/buscar"
                class="mt-4 inline-block rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Explorar produtos
              </Link>
            </div>
          }
        >
          <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <For each={items() ?? []}>{(p) => <ProductCard product={p} />}</For>
          </div>
        </Show>
      </div>
    </StoreShell>
  );
}
