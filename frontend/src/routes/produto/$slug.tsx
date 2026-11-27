import { ProductImage } from "../../features/storefront/components/ProductImage";
import { createFileRoute, Link, redirect } from "@tanstack/solid-router";
import BadgePercent from "lucide-solid/icons/badge-percent";
import Bell from "lucide-solid/icons/bell";
import Boxes from "lucide-solid/icons/boxes";
import Camera from "lucide-solid/icons/camera";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronUp from "lucide-solid/icons/chevron-up";
import CreditCard from "lucide-solid/icons/credit-card";
import ExternalLink from "lucide-solid/icons/external-link";
import Loader2 from "lucide-solid/icons/loader-circle";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import Sparkles from "lucide-solid/icons/sparkles";
import Star from "lucide-solid/icons/star";
import Truck from "lucide-solid/icons/truck";
import X from "lucide-solid/icons/x";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { NewsletterSection } from "../../features/storefront/components/NewsletterSection";
import { MultiShadePurchaseGrid } from "../../features/storefront/components/MultiShadePurchaseGrid";
import { ProductCard } from "../../features/storefront/components/ProductCard";
import { SectionHeading } from "../../features/storefront/components/SectionHeading";
import { ShippingQuoteWidget } from "../../features/storefront/components/ShippingQuoteWidget";
import { StoreShell } from "../../features/storefront/components/StoreShell";
import { VariantRestockModal } from "../../features/storefront/components/VariantRestockModal";
import {
  evaluateAxisOptionAvailability,
  getVariantOptionMap,
  normalizeOptionSlug,
  resolveSelectedVariant,
} from "../../features/storefront/variant-selection";
import { addToReplenishment } from "../../features/storefront/replenishment";
import {
  addBulkCartItems,
  addCartItem,
  storefrontStore,
} from "../../features/storefront/store";
import { session } from "../../security/session";
import type {
  ProductDetailData,
  ProductVariantData,
} from "../../features/storefront/types";
import { ApiError, api } from "../../lib/api";
import { formatCents, whatsappUrl } from "../../lib/format";
import { stripHtmlToPlainText } from "../../lib/rich-text";
import { RichProductText } from "../../features/storefront/components/RichProductText";
import {
  computeWholesaleUnitPrice,
  type WholesaleTier,
} from "../../features/storefront/wholesale";
import {
  trackAddToCart,
  trackContactClick,
  trackViewItem,
} from "../../monitoring/analytics";
import {
  buildBreadcrumbSchema,
  buildProductSchema,
  seoHead,
} from "../../lib/seo";

const VIEWED_STORAGE_KEY = "mf_viewed_products";

interface ViewedProductSummary {
  slug: string;
  name: string;
  primary_image: string | null;
}

function readViewedProducts(): ViewedProductSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ViewedProductSummary[]) : [];
  } catch {
    return [];
  }
}

function recordViewedProduct(
  item: ViewedProductSummary,
): ViewedProductSummary[] {
  const existing = readViewedProducts().filter((v) => v.slug !== item.slug);
  const next = [item, ...existing].slice(0, 4);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors in private mode
    }
  }
  return next;
}

export const Route = createFileRoute("/produto/$slug")({
  loader: async ({ params }) => {
    try {
      const res = await api<{ data: ProductDetailData }>(
        `/catalog/products/${params.slug}`,
        { authenticated: false },
      );
      return res.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 301 && err.redirectTo) {
        throw redirect({ to: err.redirectTo, replace: true });
      }
      return null;
    }
  },
  head: ({ loaderData, params }) => {
    const p = loaderData;
    const defVariant =
      p?.variants.find((v) => v.is_default && v.in_stock) ?? p?.variants[0];
    const priceCents = defVariant?.price_cents ?? p?.price_cents ?? 0;
    const effectivePriceCents =
      defVariant?.effective_price_cents ??
      p?.effective_price_cents ??
      priceCents;
    const promoPriceCents =
      effectivePriceCents < priceCents ? effectivePriceCents : undefined;
    const inStock = p ? p.variants.some((v) => v.in_stock) : false;

    const reviews = p?.reviews ?? [];
    const reviewCount = reviews.length;
    const ratingValue =
      reviewCount > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : undefined;
    const effectivePriceStr = (effectivePriceCents / 100).toFixed(2);

    const brandSuffix = p?.brand?.name ? ` da marca ${p.brand.name}` : "";
    const categorySuffix = p?.categories?.[0]?.name
      ? ` na categoria ${p.categories[0].name}`
      : "";
    const fallbackDescription = p
      ? `Conheça ${p.name}${brandSuffix}${categorySuffix} na Mistura Feminina. Confira características, especificações e disponibilidade para comprar online.`
      : "Produto não encontrado na Mistura Feminina Cosméticos.";

    return seoHead({
      title:
        p?.seo_title ||
        (p
          ? `${p.name} | Mistura Feminina`
          : `${params.slug} | Mistura Feminina`),
      description:
        stripHtmlToPlainText(
          p?.seo_description || p?.short_description || p?.description,
        ) || fallbackDescription,
      path: `/produto/${params.slug}`,
      image: p?.primary_image || undefined,
      type: "product",
      price: effectivePriceStr,
      currency: "BRL",
      noindex: !p,
      jsonLd: p
        ? [
            buildProductSchema({
              name: p.name,
              description: stripHtmlToPlainText(
                p.short_description || p.description,
              ),
              sku: defVariant?.sku || p.sku,
              gtin: defVariant?.gtin || p.gtin,
              category: p.categories?.[0]?.name,
              brand: p.brand?.name,
              image: p.primary_image,
              images: p.images?.map((i) => i.path),
              priceCents,
              promoPriceCents,
              inStock,
              slug: p.slug,
              ratingValue,
              reviewCount,
              reviews: p.reviews,
            }),
            buildBreadcrumbSchema([
              { name: "Início", path: "/" },
              ...(p.categories && p.categories[0]
                ? [
                    {
                      name: p.categories[0].name,
                      path: `/categoria/${p.categories[0].slug}`,
                    },
                  ]
                : []),
              { name: p.name, path: `/produto/${p.slug}` },
            ]),
          ]
        : undefined,
    });
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const settings = () => storefrontStore.settings();

  const [product, { refetch }] = createResource<ProductDetailData, string>(
    () => params().slug,
    async (slug, { refetching }) => {
      const initial = loaderData() as ProductDetailData | null | undefined;
      if (!refetching && initial && initial.slug === slug) {
        return initial;
      }
      const res = await api<{ data: ProductDetailData }>(
        `/catalog/products/${slug}`,
        {
          authenticated: false,
        },
      );
      return res.data;
    },
  );

  const [selectedVariantId, setSelectedVariantId] = createSignal<number | null>(
    null,
  );
  const [selectedByAxis, setSelectedByAxis] = createSignal<Record<string, string>>({});
  const [activeImage, setActiveImage] = createSignal<string | null>(null);
  const [qty, setQty] = createSignal(1);
  const [adding, setAdding] = createSignal(false);
  const [feedback, setFeedback] = createSignal<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Restock alert state
  const [restockName, setRestockName] = createSignal("");
  const [restockEmail, setRestockEmail] = createSignal("");
  const [restockBusy, setRestockBusy] = createSignal(false);
  const [restockMsg, setRestockMsg] = createSignal<string | null>(null);
  const [bulkBusy, setBulkBusy] = createSignal(false);
  const [replenishBusy, setReplenishBusy] = createSignal(false);
  const [modalRestockVariant, setModalRestockVariant] =
    createSignal<ProductVariantData | null>(null);

  // Review state
  const [revName, setRevName] = createSignal("");
  const [revEmail, setRevEmail] = createSignal("");
  const [revRating, setRevRating] = createSignal(5);
  const [revTitle, setRevTitle] = createSignal("");
  const [revBody, setRevBody] = createSignal("");
  const [revVariantId, setRevVariantId] = createSignal("");
  const [revConsent, setRevConsent] = createSignal(true);
  const [revPhotos, setRevPhotos] = createSignal<string[]>([]);
  const [revUploadingPhoto, setRevUploadingPhoto] = createSignal(false);
  const [revPhotoError, setRevPhotoError] = createSignal<string | null>(null);
  const [activePhotoModal, setActivePhotoModal] = createSignal<string | null>(null);
  const [revBusy, setRevBusy] = createSignal(false);
  const [revMsg, setRevMsg] = createSignal<string | null>(null);
  const [openAccordion, setOpenAccordion] = createSignal<
    "descricao" | "pagamento" | "avaliacoes" | null
  >(null);
  const [viewedProducts, setViewedProducts] = createSignal<
    ViewedProductSummary[]
  >([]);

  createEffect(() => {
    const p = product();
    if (!p) return;
    const searchVariantParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("variant")
        : null;
    const requestedVariant = searchVariantParam
      ? (p.variants.find(
          (v) =>
            String(v.id) === searchVariantParam ||
            v.sku === searchVariantParam,
        ) ?? null)
      : null;
    const def =
      requestedVariant ??
      (p.variants.find((v) => v.is_default && v.in_stock) ??
        p.variants.find((v) => v.in_stock) ??
        p.variants[0]);
    setSelectedVariantId(def?.id ?? null);
    setSelectedByAxis(def ? getVariantOptionMap(def) : {});
    setActiveImage(
      def?.image_path || p.primary_image || p.images[0]?.path || null,
    );
    setQty(1);
    setFeedback(null);
    setOpenAccordion(null);
    setViewedProducts(
      recordViewedProduct({
        slug: p.slug,
        name: p.name,
        primary_image: p.primary_image || p.images[0]?.path || null,
      }),
    );
    trackViewItem({
      currency: "BRL",
      value: (def?.effective_price_cents ?? p.effective_price_cents) / 100,
      items: [
        {
          item_id: def?.sku || p.sku,
          item_name: p.name,
          price: (def?.effective_price_cents ?? p.effective_price_cents) / 100,
          item_brand: p.brand?.name,
          item_category: p.categories && p.categories[0]?.name,
          quantity: 1,
        },
      ],
    });
  });

  const effectiveAxes = createMemo(() => {
    const p = product();
    if (!p) return [];
    const axes = p.variation_axes ?? [];
    if (axes.length > 0) return axes;
    if (
      p.has_variants ||
      p.variants.length > 1 ||
      (p.variants.length === 1 && p.variants[0]!.name !== "Padrão")
    ) {
      return [
        {
          slug: "opcao",
          name: p.name.split(" ").slice(0, 2).join(" ") || "Opção",
          display_type: "pill",
          values: p.variants.map((v) => ({
            slug: normalizeOptionSlug(v.name),
            value: v.name,
            color_hex: v.color_hex ?? null,
          })),
        },
      ];
    }
    return [];
  });

  const hasSelectableVariations = createMemo(() => effectiveAxes().length > 0);

  const variantResolution = createMemo(() => {
    const p = product();
    if (!p) return { state: "not_sold" as const, variant: null };
    const axes = effectiveAxes();
    if (axes.length === 0) {
      const def =
        p.variants.find((v) => v.id === selectedVariantId()) ??
        p.variants[0] ??
        null;
      if (!def) {
        return {
          state: p.in_stock
            ? ("matched_in_stock" as const)
            : ("matched_out_of_stock" as const),
          variant: null,
        };
      }
      return {
        state: def.in_stock
          ? ("matched_in_stock" as const)
          : ("matched_out_of_stock" as const),
        variant: def,
      };
    }
    return resolveSelectedVariant(axes, selectedByAxis(), p.variants);
  });

  const isNotSoldCombination = () => variantResolution().state === "not_sold";

  const activeVariant = createMemo<ProductVariantData | null>(() => {
    return variantResolution().variant;
  });

  const wholesaleCondition = () => product()?.wholesale_condition;
  const wholesaleTiers = (): WholesaleTier[] => {
    const p = product();
    if (p?.wholesale_condition?.tiers && p.wholesale_condition.tiers.length > 0) {
      return p.wholesale_condition.tiers as WholesaleTier[];
    }
    return (p?.wholesale_tiers ?? []).map((t) => ({
      min_quantity: t.min_qty,
      min_qty: t.min_qty,
      discount_type: "percent",
      discount_value: t.discount_percent,
      discount_percent: t.discount_percent,
    })) as WholesaleTier[];
  };
  const hasWholesale = () =>
    Boolean(wholesaleCondition()?.has_wholesale || wholesaleTiers().length > 0);
  const minWholesaleQty = () =>
    wholesaleCondition()?.min_quantity ??
    (wholesaleTiers()[0] as any)?.min_quantity ??
    (wholesaleTiers()[0] as any)?.min_qty ??
    6;

  const basePriceCents = () =>
    activeVariant()?.effective_price_cents ??
    product()?.effective_price_cents ??
    0;

  const currentPriceCents = () => {
    const base = basePriceCents();
    const tiers = wholesaleTiers();
    if (tiers.length === 0) return base;
    const pricing = computeWholesaleUnitPrice(base, qty(), tiers);
    return pricing.unitPriceCents;
  };

  const isWholesaleActive = () => currentPriceCents() < basePriceCents();
  const wholesaleSavingsCents = () =>
    Math.max(0, (basePriceCents() - currentPriceCents()) * qty());
  const totalPriceCents = () => currentPriceCents() * qty();

  const originalPriceCents = () =>
    activeVariant()?.price_cents ?? product()?.price_cents ?? 0;

  const discountPct = () => {
    const orig = originalPriceCents();
    const cur = currentPriceCents();
    if (orig > 0 && cur < orig) {
      return Math.round(((orig - cur) / orig) * 100);
    }
    return product()?.discount_percent ?? 0;
  };

  const inStock = () => {
    if (isNotSoldCombination()) return false;
    return activeVariant()?.in_stock ?? product()?.in_stock ?? false;
  };
  const maxQty = () =>
    Math.max(
      1,
      activeVariant()?.available_stock ?? product()?.available_stock ?? 1,
    );

  function chooseVariant(v: ProductVariantData) {
    const p = product();
    setSelectedVariantId(v.id);
    setSelectedByAxis(getVariantOptionMap(v));
    if (v.image_path) {
      setActiveImage(v.image_path);
    } else if (p) {
      setActiveImage(p.primary_image || p.images[0]?.path || null);
    }
    setQty(1);
    setRestockMsg(null);
    if (typeof window !== "undefined" && window.history?.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("variant", String(v.id));
        window.history.replaceState(null, "", url.toString());
      } catch {
        // Ignora erros de URL em ambientes isolados
      }
    }
  }

  function selectAxisOption(axisSlug: string, optionSlug: string) {
    const p = product();
    if (!p) return;
    const nextMap = { ...selectedByAxis(), [axisSlug]: optionSlug };
    setSelectedByAxis(nextMap);
    const resolved = resolveSelectedVariant(effectiveAxes(), nextMap, p.variants);
    setSelectedVariantId(resolved.variant?.id ?? null);
    if (resolved.variant?.image_path) {
      setActiveImage(resolved.variant.image_path);
    } else {
      setActiveImage(p.primary_image || p.images[0]?.path || null);
    }
    setQty(1);
    setRestockMsg(null);
    if (
      resolved.variant &&
      typeof window !== "undefined" &&
      window.history?.replaceState
    ) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("variant", String(resolved.variant.id));
        window.history.replaceState(null, "", url.toString());
      } catch {
        // Ignora erros de URL em ambientes isolados
      }
    }
  }

  async function handleAddToCart() {
    const v = activeVariant();
    if (!v || !inStock()) return;
    setAdding(true);
    setFeedback(null);
    try {
      await addCartItem(v.id, qty(), true);
      const p = product();
      trackAddToCart({
        currency: "BRL",
        value: (v.effective_price_cents * qty()) / 100,
        items: [
          {
            item_id: v.sku,
            item_name: p?.name || v.name,
            price: v.effective_price_cents / 100,
            item_brand: p?.brand?.name,
            item_category: p?.categories && p.categories[0]?.name,
            quantity: qty(),
          },
        ],
      });
      setFeedback({ type: "ok", text: "Produto adicionado ao carrinho." });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar ao carrinho.",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleBulkAddToCart(
    items: Array<{ variant_id: number; quantity: number }>,
  ) {
    const p = product();
    if (!p || items.length === 0) return;
    setBulkBusy(true);
    setFeedback(null);
    try {
      const res = await addBulkCartItems(items, true);
      const totalAdded = res.added.reduce(
        (acc, i) => acc + i.added_quantity,
        0,
      );
      setFeedback({
        type: res.rejected.length > 0 ? "err" : "ok",
        text:
          res.rejected.length > 0
            ? `${totalAdded} un. adicionada(s). ${res.rejected.length} item(ns) indisponível(is).`
            : `${totalAdded} unidade(s) adicionada(s) ao carrinho!`,
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar as cores selecionadas.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleAddReplenishment() {
    const p = product();
    const v = activeVariant();
    if (!p || !v) return;
    setReplenishBusy(true);
    setFeedback(null);
    try {
      const res = await addToReplenishment(
        {
          product: p,
          variant: v,
          quantity: qty(),
        },
        session.status() === "authenticated",
      );
      setFeedback({
        type: "ok",
        text:
          res.mode === "account"
            ? "Adicionado à sua Lista de Reposição!"
            : "Salvo na Lista de Reposição neste navegador (entre para sincronizar).",
      });
    } catch (err) {
      setFeedback({
        type: "err",
        text:
          err instanceof ApiError
            ? err.message
            : "Não foi possível adicionar à lista de reposição.",
      });
    } finally {
      setReplenishBusy(false);
    }
  }

  async function submitRestock(e: Event) {
    e.preventDefault();
    const p = product();
    if (!p || !restockEmail().trim()) return;
    setRestockBusy(true);
    setRestockMsg(null);
    try {
      const res = await api<{ message: string }>(
        `/catalog/products/${p.slug}/restock-alert`,
        {
          method: "POST",
          authenticated: false,
          body: {
            variant_id: activeVariant()?.id,
            email: restockEmail().trim(),
            name: restockName().trim() || undefined,
          },
        },
      );
      setRestockMsg(
        res.message ||
          "Você será avisada assim que este item voltar ao estoque.",
      );
      setRestockEmail("");
      setRestockName("");
    } catch (err) {
      if (err instanceof ApiError) {
        const validationMsg =
          Object.values(err.validation || {}).flat()[0] ||
          (typeof err.payload?.message === "string"
            ? err.payload.message
            : undefined);
        setRestockMsg(validationMsg || err.message);
      } else {
        setRestockMsg("Não foi possível registrar seu aviso.");
      }
    } finally {
      setRestockBusy(false);
    }
  }

  async function handleUploadReviewPhoto(file: File) {
    if (revPhotos().length >= 3) {
      setRevPhotoError("Você pode anexar no máximo 3 fotos.");
      return;
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setRevPhotoError("A imagem excede o tamanho máximo de 5 MB.");
      return;
    }
    setRevPhotoError(null);
    setRevUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ data: { path: string } }>(
        "/catalog/reviews/upload-photo",
        {
          method: "POST",
          authenticated: false,
          body: fd,
        },
      );
      if (res?.data?.path) {
        setRevPhotos((prev) => [...prev, res.data.path]);
      }
    } catch (err) {
      setRevPhotoError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar a foto. Tente novamente.",
      );
    } finally {
      setRevUploadingPhoto(false);
    }
  }

  function removeReviewPhoto(index: number) {
    setRevPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitReview(e: Event) {
    e.preventDefault();
    const p = product();
    if (!p) return;
    if (!revConsent()) {
      setRevMsg("Por favor, autorize a exibição da sua avaliação.");
      return;
    }
    setRevBusy(true);
    setRevMsg(null);
    try {
      const res = await api<{ message: string }>(
        `/catalog/products/${p.slug}/reviews`,
        {
          method: "POST",
          authenticated: false,
          body: {
            author_name: revName().trim(),
            author_email: revEmail().trim() || undefined,
            rating: revRating(),
            title: revTitle().trim() || undefined,
            body: revBody().trim(),
            variant_id: revVariantId() ? Number(revVariantId()) : undefined,
            photos: revPhotos(),
          },
        },
      );
      setRevMsg(
        res.message || "Obrigada! Sua avaliação com foto foi enviada para moderação.",
      );
      setRevName("");
      setRevEmail("");
      setRevTitle("");
      setRevBody("");
      setRevPhotos([]);
      setRevVariantId("");
    } catch (err) {
      setRevMsg(
        err instanceof ApiError
          ? err.message
          : "Verifique os campos da avaliação.",
      );
    } finally {
      setRevBusy(false);
    }
  }

  return (
    <StoreShell>
      <VariantRestockModal
        open={Boolean(modalRestockVariant())}
        productSlug={product()?.slug ?? ""}
        productName={product()?.name ?? ""}
        variant={modalRestockVariant()}
        whatsappEnabled={false}
        onClose={() => setModalRestockVariant(null)}
      />
      <Show when={product.loading}>
        <div class="mx-auto max-w-7xl px-4 py-8">
          <div class="grid gap-8 lg:grid-cols-12">
            <div class="aspect-square animate-pulse rounded-2xl bg-zinc-100 lg:col-span-7" />
            <div class="space-y-4 lg:col-span-5">
              <div class="h-8 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div class="h-24 animate-pulse rounded bg-zinc-100" />
              <div class="h-12 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        </div>
      </Show>

      <Show when={product.error}>
        <div class="mx-auto max-w-7xl px-4 py-8">
          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-10 text-center">
            <h1 class="text-xl font-bold text-zinc-900">
              Produto não encontrado
            </h1>
            <p class="mt-2 text-sm text-zinc-600">
              Este item pode ter sido desativado ou o endereço mudou.
            </p>
            <div class="mt-5 flex justify-center gap-3">
              <Link
                to="/buscar"
                class="rounded-lg bg-[var(--mf-primary)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Explorar catálogo
              </Link>
              <button
                type="button"
                onClick={() => void refetch()}
                class="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={product()}>
        {(p) => {
          const installments = () => 3;
          const installmentValue = () =>
            Math.ceil(totalPriceCents() / installments());
          const galleryImages = () => {
            const base =
              p().images && p().images.length > 0
                ? [...p().images]
                : p().primary_image
                  ? [
                      {
                        id: 0,
                        path: p().primary_image!,
                        alt_text: p().primary_image_alt || p().name,
                        is_primary: true,
                        sort_order: 0,
                      },
                    ]
                  : [];

            // Se a variação ativa possui foto própria que não está na lista base, insere na primeira posição da galeria
            const vImg = activeVariant()?.image_path;
            if (vImg && !base.some((img) => img.path === vImg)) {
              return [
                {
                  id: -1,
                  path: vImg,
                  alt_text: activeVariant()?.name ? `${p().name} — ${activeVariant()!.name}` : p().name,
                  is_primary: false,
                  sort_order: -1,
                },
                ...base,
              ];
            }

            return base;
          };
          const stepGalleryImage = (delta: number) => {
            const imgs = galleryImages();
            if (imgs.length <= 1) return;
            const currentIdx = Math.max(
              0,
              imgs.findIndex((i) => i.path === activeImage()),
            );
            const nextIdx = (currentIdx + delta + imgs.length) % imgs.length;
            setActiveImage(imgs[nextIdx]!.path);
          };
          const toggleAccordion = (
            panel: "descricao" | "pagamento" | "avaliacoes",
          ) => {
            setOpenAccordion((cur) => (cur === panel ? null : panel));
          };
          const openReviewsAccordion = (e: Event) => {
            e.preventDefault();
            setOpenAccordion("avaliacoes");
            if (typeof document !== "undefined") {
              document
                .getElementById("avaliacoes")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          };

          return (
            <>
              <div class="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:pt-6">
                <nav
                  aria-label="Navegação estrutural"
                  class="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs text-[#2E0C49]"
                >
                  <Link to="/" class="hover:underline">
                    Home
                  </Link>
                  <Show
                    when={(p().category_ancestors?.length ?? 0) > 0}
                    fallback={
                      <Show when={p().categories[0]}>
                        {(cat) => (
                          <>
                            <span aria-hidden="true" class="text-[#2E0C49]/50">
                              /
                            </span>
                            <Link
                              to="/categoria/$slug"
                              params={{ slug: cat().slug }}
                              class="hover:underline"
                            >
                              {cat().name}
                            </Link>
                          </>
                        )}
                      </Show>
                    }
                  >
                    <For each={p().category_ancestors ?? []}>
                      {(anc) => (
                        <>
                          <span aria-hidden="true" class="text-[#2E0C49]/50">
                            /
                          </span>
                          <Link
                            to="/categoria/$slug"
                            params={{ slug: anc.slug }}
                            class="hover:underline"
                          >
                            {anc.name}
                          </Link>
                        </>
                      )}
                    </For>
                  </Show>
                  <span aria-hidden="true" class="text-[#2E0C49]/50">
                    /
                  </span>
                  <span class="font-medium text-[#2E0C49]">{p().name}</span>
                </nav>

                <div class="grid gap-8 lg:grid-cols-12 lg:items-start">
                  {/* Gallery: vertical thumbnails left + large main image right */}
                  <div class="lg:col-span-7">
                    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
                      <Show when={galleryImages().length > 0}>
                        <div class="flex flex-row items-center gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                          <button
                            type="button"
                            onClick={() => stepGalleryImage(-1)}
                            aria-label="Imagem anterior"
                            class="hidden size-6 shrink-0 items-center justify-center rounded-md border border-[#93509e] bg-white text-[#93509e] transition hover:bg-[#93509e] hover:text-white sm:inline-flex"
                          >
                            <ChevronUp class="h-3.5 w-3.5" aria-hidden="true" />
                          </button>

                          <div class="flex flex-row gap-2 sm:flex-col">
                            <For each={galleryImages().slice(0, 5)}>
                              {(img) => (
                                <button
                                  type="button"
                                  onClick={() => setActiveImage(img.path)}
                                  aria-label={img.alt_text || p().name}
                                  class={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white p-1 transition sm:h-20 sm:w-20 ${
                                    activeImage() === img.path
                                      ? "border-[#2E0C49] ring-1 ring-[#2E0C49]"
                                      : "border-zinc-200 hover:border-zinc-400"
                                  }`}
                                >
                                  <ProductImage
                                    src={img.path}
                                    alt={img.alt_text || p().name}
                                    width="80"
                                    height="80"
                                    loading="lazy"
                                    decoding="async"
                                    class="h-full w-full object-contain"
                                  />
                                </button>
                              )}
                            </For>
                          </div>

                          <button
                            type="button"
                            onClick={() => stepGalleryImage(1)}
                            aria-label="Próxima imagem"
                            class="hidden size-6 shrink-0 items-center justify-center rounded-md border border-[#93509e] bg-white text-[#93509e] transition hover:bg-[#93509e] hover:text-white sm:inline-flex"
                          >
                            <ChevronDown
                              class="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </Show>

                      <div class="relative aspect-square flex-1 overflow-hidden rounded-xl bg-white">
                        <ProductImage
                          src={activeImage() || p().primary_image}
                          alt={
                            p().primary_image_alt ||
                            `${p().name} — Mistura Feminina Cosméticos`
                          }
                          loading="eager"
                          fetchpriority="high"
                          decoding="async"
                          width="600"
                          height="600"
                          class="h-full w-full object-contain p-2 sm:p-4"
                        />
                        <Show when={discountPct() > 0}>
                          <span class="sr-only">-{discountPct()}% OFF</span>
                        </Show>
                      </div>
                    </div>
                  </div>

                  {/* Buy Box */}
                  <div class="space-y-4 lg:col-span-5">
                    <div>
                      <h1 class="text-xl font-extrabold text-[#2E0C49] sm:text-[22px]">
                        {p().name}
                      </h1>
                      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#2E0C49]/80">
                        <span>
                          SKU:{" "}
                          <strong class="font-mono font-semibold text-[#2E0C49]">
                            {isNotSoldCombination()
                              ? "—"
                              : (activeVariant()?.sku ?? p().sku)}
                          </strong>
                        </span>
                        <Show when={p().unit_label}>
                          <span class="rounded border border-[#E5DAE9] bg-[#FAF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#62298d]">
                            Apresentação: {p().unit_label}
                          </span>
                        </Show>
                      </div>
                    </div>

                    <div>
                      <div
                        role="img"
                        class="flex items-center gap-0.5 text-amber-400"
                        aria-label={
                          p().rating_count > 0
                            ? `${p().rating_avg.toFixed(1)} de 5 estrelas`
                            : "Sem avaliações ainda"
                        }
                      >
                        <For each={[1, 2, 3, 4, 5]}>
                          {(n) => (
                            <Star
                              class={`h-3.5 w-3.5 ${
                                p().rating_count > 0 &&
                                n <= Math.round(p().rating_avg)
                                  ? "fill-current text-amber-400"
                                  : "text-amber-300"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </For>
                      </div>
                      <a
                        href="#avaliacoes"
                        onClick={openReviewsAccordion}
                        class="mt-1 inline-block text-xs font-medium text-[#2E0C49] underline hover:text-[#62298D]"
                      >
                        {p().rating_count > 0
                          ? `Ver avaliações (${p().rating_count})`
                          : "Seja o primeiro a opinar"}
                      </a>
                    </div>

                    <div class="flex items-center gap-2 pt-0.5 text-xs text-[#2E0C49]">
                      <span
                        class="relative inline-flex size-3.5 shrink-0 items-center justify-center"
                        aria-hidden="true"
                      >
                        <span class="mf-live-dot-ping absolute inline-flex size-full rounded-full bg-[#F87171]/60" />
                        <span class="mf-live-dot-core relative inline-block size-2.5 rounded-full bg-[#F87171] ring-3 ring-[#FEE2E2]" />
                      </span>
                      <span>
                        <strong class="font-extrabold">
                          {11 + (p().id % 7)}
                        </strong>{" "}
                        Pessoas estão vendo este produto agora
                      </span>
                    </div>

                    <Show when={hasSelectableVariations()}>
                      <div class="space-y-3 pt-1" data-testid="pdp-variation-axes">
                        <For each={effectiveAxes()}>
                          {(axis) => (
                            <div class="space-y-1.5">
                              <div class="flex items-center justify-between text-xs">
                                <span class="font-bold text-[#2E0C49]">
                                  {axis.name}:{" "}
                                  <span class="font-semibold text-[#93509e]">
                                    {axis.values.find(
                                      (v) => v.slug === selectedByAxis()[axis.slug],
                                    )?.value ?? "Selecione"}
                                  </span>
                                </span>
                              </div>
                              <div
                                role="radiogroup"
                                aria-label={axis.name}
                                class="flex flex-wrap gap-2"
                              >
                                <For each={axis.values}>
                                  {(val) => {
                                    const isSelected = () =>
                                      selectedByAxis()[axis.slug] === val.slug;
                                    const availability = () =>
                                      evaluateAxisOptionAvailability(
                                        effectiveAxes(),
                                        selectedByAxis(),
                                        axis.slug,
                                        val.slug,
                                        p().variants,
                                      );
                                    return (
                                      <button
                                        type="button"
                                        role="radio"
                                        aria-checked={isSelected()}
                                        data-axis-slug={axis.slug}
                                        data-option-slug={val.slug}
                                        data-option-state={availability()}
                                        onClick={() =>
                                          selectAxisOption(axis.slug, val.slug)
                                        }
                                        class={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#93509e] ${
                                          isSelected()
                                            ? "border-[#93509e] bg-[#FAF5FB] text-[#2E0C49] ring-1 ring-[#93509e]/40"
                                            : availability() === "not_sold"
                                              ? "border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 hover:border-zinc-400"
                                              : availability() === "out_of_stock"
                                                ? "border-amber-200 bg-amber-50/40 text-zinc-600 line-through decoration-zinc-400 hover:border-[#93509e]/40"
                                                : "border-[#E5DAE9] bg-white text-[#2E0C49] hover:border-[#93509e]"
                                        }`}
                                      >
                                        <Show
                                          when={(() => {
                                            const match = p().variants.find(
                                              (v) =>
                                                v.option_values?.some(
                                                  (ov) =>
                                                    ov.attribute_slug === axis.slug &&
                                                    (ov.value_slug === val.slug || ov.value === val.value),
                                                ) && Boolean(v.image_path),
                                            );
                                            return match?.image_path ?? null;
                                          })()}
                                          fallback={
                                            <Show when={val.color_hex}>
                                              <span
                                                aria-hidden="true"
                                                class="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                                                style={{ background: val.color_hex! }}
                                              />
                                            </Show>
                                          }
                                        >
                                          {(vImg) => (
                                            <ProductImage
                                              src={vImg()}
                                              alt={val.value}
                                              width="16"
                                              height="16"
                                              class="h-4 w-4 shrink-0 rounded object-contain border border-zinc-200 bg-white"
                                            />
                                          )}
                                        </Show>
                                        <span>{val.value}</span>
                                        <Show
                                          when={
                                            !isSelected() &&
                                            availability() === "out_of_stock"
                                          }
                                        >
                                          <span class="text-[10px] font-medium text-amber-700 no-underline">
                                            (Esgotado)
                                          </span>
                                        </Show>
                                      </button>
                                    );
                                  }}
                                </For>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>

                    {/* Price & installment */}
                    <div class="rounded-xl border border-[#F0DDF4] bg-white p-4 shadow-[0_2px_10px_rgba(46,12,73,0.03)]">
                      <Show
                        when={
                          discountPct() > 0 &&
                          originalPriceCents() > currentPriceCents()
                        }
                      >
                        <div class="mb-1.5 flex flex-wrap items-center gap-2">
                          <span class="text-xs font-medium text-[#6B587E] line-through">
                            De {formatCents(originalPriceCents())}
                          </span>
                          <span class="inline-flex items-center rounded-md bg-[#2E0C49] px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
                            -{discountPct()}% OFF
                          </span>
                          <span class="inline-flex items-center rounded-md border border-[#E9D3EE] bg-[#FAF4FC] px-2 py-0.5 text-[11px] font-bold text-[#93509e]">
                            Economize{" "}
                            {formatCents(
                              originalPriceCents() - currentPriceCents(),
                            )}
                            /un.
                          </span>
                        </div>
                      </Show>

                      <div class="flex flex-wrap items-baseline gap-2">
                        <span class="text-3xl font-extrabold tracking-tight text-[#2E0C49] sm:text-[32px]">
                          {formatCents(currentPriceCents())}
                        </span>
                        <span class="text-xs font-semibold text-[#6B587E]">
                          {isWholesaleActive() ? "cada (Preço de Atacado)" : "à vista"}
                        </span>
                      </div>

                      <Show when={qty() > 1}>
                        <div class="mt-2 flex flex-wrap items-center justify-between rounded-lg border border-[#ECD4EF] bg-[#FAF5FB] px-3 py-2 text-xs">
                          <span class="font-bold text-[#3D1260]">
                            Subtotal ({qty()} {qty() === 1 ? "unidade" : "unidades"}):
                          </span>
                          <span class="text-sm font-extrabold text-[#93509e]">
                            {formatCents(totalPriceCents())}
                          </span>
                        </div>
                      </Show>

                      <Show when={isWholesaleActive()}>
                        <div class="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                          <Sparkles class="size-3.5 text-emerald-600 shrink-0" />
                          <span>
                            Desconto de Atacado automático! Economia de {formatCents(wholesaleSavingsCents())}.
                          </span>
                        </div>
                      </Show>

                      <p class="mt-2.5 flex items-center gap-2 border-t border-[#F6EBF8] pt-2.5 text-[13px] text-[#2E0C49]">
                        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[#EFE0F3] bg-[#FAF5FB] text-[#93509e]">
                          <CreditCard class="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span>
                          ou em até{" "}
                          <strong class="font-extrabold text-[#93509e]">
                            {installments()}x de{" "}
                            {formatCents(installmentValue())}
                          </strong>{" "}
                          <span class="font-semibold text-[#2E0C49]">
                            Sem juros
                          </span>
                        </span>
                      </p>
                    </div>

                    {/* Tabela de Atacado Simplificada */}
                    <div class="rounded-xl border border-[#ECD4EF] bg-[#FDF9FE] p-3.5 text-[#2E0C49]">
                      <div class="flex items-center justify-between gap-2">
                        <span class="flex items-center gap-1.5 text-xs font-bold text-[#2E0C49]">
                          <Boxes class="size-3.5 text-[#93509e]" aria-hidden="true" />
                          Tabela de Atacado
                        </span>
                        <span class="text-[11px] font-medium text-[#7C558F]">
                          Preço progressivo por quantidade
                        </span>
                      </div>

                      <Show when={wholesaleTiers().length > 0}>
                        <div class="mt-2.5 grid grid-cols-3 gap-2">
                          <For each={wholesaleTiers()}>
                            {(tier) => {
                              const minQ = tier.min_quantity ?? (tier as any).min_qty ?? 1;
                              const maxQ = tier.max_quantity ?? null;
                              const isTierActive = () => qty() >= minQ && (maxQ === null || qty() <= maxQ);
                              const tierPriceCents = tier.unit_price_cents ?? (tier.discount_type === 'fixed_price' ? Math.round(Number(tier.discount_value) * 100) : Math.round(basePriceCents() * (1 - Number(tier.discount_value) / 100)));
                              return (
                                <button
                                  type="button"
                                  onClick={() => setQty(minQ)}
                                  class={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-center transition-all ${
                                    isTierActive()
                                      ? "border-[#93509e] bg-white ring-1 ring-[#93509e]/30 shadow-2xs"
                                      : "border-[#ECD4EF] bg-white/80 hover:border-[#93509e]/50"
                                  }`}
                                >
                                  <span class="text-[11.5px] font-bold text-[#543E69] whitespace-nowrap">
                                    {minQ}{maxQ ? ` a ${maxQ}` : "+"} un.
                                  </span>
                                  <span class="text-sm font-extrabold text-[#93509e] whitespace-nowrap">
                                    {tier.unit_price_formatted ?? formatCents(tierPriceCents)}
                                  </span>
                                  <span class="text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                                    {tier.discount_cents ? `Economize ${formatCents(tier.discount_cents)}` : `-${tier.discount_value}%`}
                                  </span>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    </div>

                    {/* Quantity pill + COMPRAR CTA + WhatsApp CTA, Not-Sold Notice, or Restock Alert */}
                    <Show
                      when={!isNotSoldCombination()}
                      fallback={
                        <div
                          data-testid="pdp-not-sold-notice"
                          class="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700"
                        >
                          <p class="font-bold text-zinc-900">
                            Combinação não comercializada pela loja
                          </p>
                          <p class="text-zinc-600">
                            Esta combinação específica de opções não faz parte do catálogo de venda. Escolha uma opção disponível abaixo:
                          </p>
                          <div class="flex flex-wrap gap-1.5">
                            <For each={p().variants.slice(0, 6)}>
                              {(alt) => (
                                <button
                                  type="button"
                                  onClick={() => chooseVariant(alt)}
                                  class="rounded-md border border-[#E5DAE9] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2E0C49] hover:border-[#93509e]"
                                >
                                  {alt.name}
                                  {alt.in_stock ? "" : " (Esgotado)"}
                                </button>
                              )}
                            </For>
                          </div>
                        </div>
                      }
                    >
                      <Show
                        when={inStock()}
                        fallback={
                          <form
                            onSubmit={submitRestock}
                            data-testid="pdp-out-of-stock-restock"
                            class="space-y-4 rounded-2xl border border-[#E5D4F0] bg-[#FAF7FC] p-4 sm:p-5"
                          >
                          <div class="flex items-start gap-3">
                            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5D4F0] bg-white text-[#93509e]">
                              <Bell class="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                              <p class="text-sm font-bold text-[#2E0C49]">
                                Produto indisponível no momento
                              </p>
                              <p class="mt-0.5 text-xs text-zinc-600">
                                Cadastre seu e-mail para ser avisada assim que
                                voltar ao estoque.
                              </p>
                            </div>
                          </div>
                          <div class="grid gap-2.5 sm:grid-cols-2">
                            <input
                              type="text"
                              aria-label="Seu nome"
                              placeholder="Seu nome"
                              value={restockName()}
                              onInput={(e) =>
                                setRestockName(e.currentTarget.value)
                              }
                              class="h-10 rounded-lg border border-zinc-200/90 bg-white px-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
                            />
                            <input
                              id="restock-email-input"
                              type="email"
                              required
                              aria-label="Seu e-mail"
                              placeholder="Seu e-mail *"
                              value={restockEmail()}
                              onInput={(e) =>
                                setRestockEmail(e.currentTarget.value)
                              }
                              class="h-10 rounded-lg border border-zinc-200/90 bg-white px-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={restockBusy()}
                            class="group/notify inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#93509e] px-5 text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#7c3f87] hover:shadow-[0_8px_20px_rgba(147,80,158,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93509e]/40 disabled:opacity-60"
                          >
                            <Bell
                              class="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/notify:-rotate-12 group-hover/notify:scale-110"
                              aria-hidden="true"
                            />
                            <span>
                              {restockBusy()
                                ? "Registrando..."
                                : "Avise-me quando voltar"}
                            </span>
                          </button>
                          <Show when={restockMsg()}>
                            <p
                              role="status"
                              class="text-xs font-medium text-[#2E0C49]"
                            >
                              {restockMsg()}
                            </p>
                          </Show>
                        </form>
                      }
                    >
                      <div class="space-y-2.5 pt-1">
                        <div class="flex items-center gap-3">
                          <div class="inline-flex h-11 w-28 shrink-0 items-center justify-between rounded-lg border border-[#E5D4F0] bg-white px-3">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              onClick={() => setQty((q) => Math.max(1, q - 1))}
                              class="rounded-md p-1 text-[#93509e] transition hover:bg-[#F5ECF7]"
                            >
                              <Minus class="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <span class="text-xs font-bold text-[#2E0C49]">
                              {qty()}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              onClick={() =>
                                setQty((q) => Math.min(maxQty(), q + 1))
                              }
                              class="rounded-md p-1 text-[#93509e] transition hover:bg-[#F5ECF7]"
                            >
                              <Plus class="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={adding()}
                            onClick={() => void handleAddToCart()}
                            class="mf-btn-buy flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-xs font-bold uppercase tracking-wider disabled:opacity-60 whitespace-nowrap"
                          >
                            {adding()
                              ? "ADICIONANDO..."
                              : isWholesaleActive()
                              ? `COMPRAR NO ATACADO (${qty()} UN.)`
                              : qty() > 1
                              ? `COMPRAR (${qty()} UN.)`
                              : "COMPRAR"}
                          </button>
                        </div>

                        <Show when={settings().whatsapp_number}>
                          <a
                            href={whatsappUrl(
                              settings().whatsapp_number,
                              `Olá! Tenho interesse no produto ${p().name} (SKU: ${activeVariant()?.sku ?? p().sku}).`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackContactClick("whatsapp")}
                            class="mf-btn-whats flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              class="h-3.5 w-3.5 shrink-0 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M12.03 2a9.94 9.94 0 0 0-8.6 14.95L2 22l5.2-1.36A9.95 9.95 0 1 0 12.03 2Zm0 18.1a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.09.81.83-3.01-.2-.31a8.15 8.15 0 1 1 7 3.82Zm4.47-6.1c-.25-.12-1.45-.72-1.67-.8s-.39-.12-.55.12-.63.8-.78.96-.28.19-.53.06a6.68 6.68 0 0 1-1.97-1.22 7.36 7.36 0 0 1-1.36-1.7c-.14-.24-.01-.38.11-.5.11-.11.24-.29.37-.43.12-.14.16-.25.24-.41s.04-.31-.02-.43-.55-1.33-.76-1.82c-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.05c0 1.21.88 2.38 1 2.54s1.73 2.64 4.19 3.7c.59.25 1.04.41 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.45-.59 1.66-1.17s.21-1.07.14-1.17-.22-.16-.47-.28Z" />
                            </svg>
                            <span class="whitespace-nowrap">
                              <span class="hidden sm:inline">Comprar pelo </span>
                              <span>WhatsApp</span>
                            </span>
                          </a>
                        </Show>

                        <button
                          type="button"
                          disabled={replenishBusy()}
                          onClick={() => void handleAddReplenishment()}
                          class="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] text-xs font-bold text-[#93509e] transition-colors hover:border-[#93509e] hover:bg-[#F3E2F6] disabled:opacity-60"
                        >
                          {replenishBusy()
                            ? "Salvando na reposição..."
                            : "Adicionar à Lista de Reposição"}
                        </button>
                      </div>
                    </Show>
                    </Show>

                    <Show when={(p().variants?.length ?? 0) > 1}>
                      <MultiShadePurchaseGrid
                        variants={p().variants}
                        fallbackImage={
                          activeImage() ||
                          p().primary_image ||
                          "/placeholder-product.svg"
                        }
                        wholesaleEnabled={hasWholesale()}
                        wholesaleGroupVariants={Boolean(
                          wholesaleCondition()?.allows_shade_mixing ??
                            p().wholesale_group_variants ??
                            true,
                        )}
                        wholesaleTiers={wholesaleTiers()}
                        busy={bulkBusy()}
                        onAddBulk={handleBulkAddToCart}
                        onSelectRestock={(v) => setModalRestockVariant(v)}
                        onHoverImage={(url) => setActiveImage(url)}
                      />
                    </Show>

                    <Show when={feedback()}>
                      {(fb) => (
                        <p
                          role={fb().type === "err" ? "alert" : "status"}
                          class={`rounded-lg px-3 py-2 text-xs font-medium ${
                            fb().type === "ok"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border border-red-200 bg-red-50 text-red-800"
                          }`}
                        >
                          {fb().text}
                        </p>
                      )}
                    </Show>

                    {/* Inline Shipping Quote */}
                    <div class="border-t border-zinc-200/80 pt-3">
                      <ShippingQuoteWidget
                        mode="product"
                        productSlug={p().slug}
                        quantity={qty()}
                      />
                    </div>

                    {/* Accordions */}
                    <div class="divide-y divide-zinc-200/80 border-y border-zinc-200/80">
                      <div>
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "descricao"}
                          onClick={() => toggleAccordion("descricao")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Descrição Geral</span>
                          <Show
                            when={openAccordion() === "descricao"}
                            fallback={
                              <ChevronRight
                                class="h-4 w-4 text-[#2E0C49]"
                                aria-hidden="true"
                              />
                            }
                          >
                            <ChevronDown
                              class="h-4 w-4 text-[#2E0C49]"
                              aria-hidden="true"
                            />
                          </Show>
                        </button>
                        <Show when={openAccordion() === "descricao"}>
                          <div class="space-y-3 pb-4 text-xs leading-relaxed text-zinc-700">
                            <RichProductText
                              text={p().description || p().short_description}
                              fallback="Descrição técnica em atualização."
                            />
                            <Show when={p().usage_instructions}>
                              <div>
                                <p class="font-bold text-[#2E0C49]">
                                  Modo de Uso
                                </p>
                                <RichProductText
                                  text={p().usage_instructions}
                                  class="mt-1 space-y-1.5 leading-relaxed [&_p+p]:mt-1.5"
                                />
                              </div>
                            </Show>
                            <Show when={p().ingredients}>
                              <div>
                                <p class="font-bold text-[#2E0C49]">
                                  Composição / Ingredientes
                                </p>
                                <RichProductText
                                  text={p().ingredients}
                                  class="mt-1 space-y-1.5 leading-relaxed [&_p+p]:mt-1.5"
                                />
                              </div>
                            </Show>
                          </div>
                        </Show>
                      </div>

                      <div>
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "pagamento"}
                          onClick={() => toggleAccordion("pagamento")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Formas de Pagamento</span>
                          <ChevronDown
                            class={`h-4 w-4 text-[#2E0C49] transition-transform ${
                              openAccordion() === "pagamento"
                                ? "rotate-180"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        <Show when={openAccordion() === "pagamento"}>
                          <div class="space-y-2 pb-4 text-xs text-zinc-700">
                            <p>
                              Parcele em até{" "}
                              <strong class="font-bold text-[#2E0C49]">
                                {installments()}x de{" "}
                                {formatCents(installmentValue())} sem juros
                              </strong>{" "}
                              nos cartões Visa, Mastercard, Elo, Amex e
                              Hipercard.
                            </p>
                            <p>Pagamento instantâneo à vista via Pix.</p>
                          </div>
                        </Show>
                      </div>

                      <div id="avaliacoes">
                        <button
                          type="button"
                          aria-expanded={openAccordion() === "avaliacoes"}
                          onClick={() => toggleAccordion("avaliacoes")}
                          class="flex w-full items-center justify-between py-3.5 text-left text-xs font-bold text-[#2E0C49]"
                        >
                          <span>Avaliações</span>
                          <ChevronDown
                            class={`h-4 w-4 text-[#2E0C49] transition-transform ${
                              openAccordion() === "avaliacoes"
                                ? "rotate-180"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                        <Show when={openAccordion() === "avaliacoes"}>
                          <div class="space-y-4 pb-4">
                            <Show
                              when={p().reviews.length > 0}
                              fallback={
                                <p class="text-xs text-zinc-600">
                                  Ainda não há avaliações aprovadas para este
                                  item. Seja a primeira a opinar!
                                </p>
                              }
                            >
                              <ul class="space-y-3">
                                <For each={p().reviews}>
                                  {(rev) => (
                                    <li class="rounded-xl border border-zinc-200 bg-[#FAF7FB] p-3.5 text-xs space-y-2">
                                      <div class="flex flex-wrap items-center justify-between gap-2">
                                        <div class="flex items-center gap-2">
                                          <span class="font-bold text-[#2E0C49]">
                                            {rev.author_name}
                                          </span>
                                          <Show when={rev.created_at}>
                                            <span class="text-[11px] text-zinc-400">
                                              • {new Date(rev.created_at).toLocaleDateString("pt-BR")}
                                            </span>
                                          </Show>
                                        </div>
                                        <span class="inline-flex items-center gap-1 font-semibold text-amber-600">
                                          {rev.rating}/5{" "}
                                          <Star
                                            class="size-3 fill-current"
                                            aria-hidden="true"
                                          />
                                        </span>
                                      </div>

                                      {/* Badges de proveniência */}
                                      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                                        <Show when={rev.is_verified_purchase}>
                                          <span class="inline-flex items-center gap-1 rounded-full bg-[#F3E2F6] px-2 py-0.5 text-[10px] font-bold text-[#93509e] border border-[#E8D2F0]">
                                            <CheckCircle2 class="size-3" />
                                            Compra verificada na Mistura Feminina
                                          </span>
                                        </Show>
                                        <Show when={rev.is_external}>
                                          <div class="space-y-0.5">
                                            <span class="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 border border-zinc-200">
                                              <span>Avaliação externa</span>
                                              <Show when={rev.source_name}>
                                                <span>•</span>
                                                <Show
                                                  when={rev.source_url}
                                                  fallback={<span>Fonte: {rev.source_name}</span>}
                                                >
                                                  <a
                                                    href={rev.source_url!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="inline-flex items-center gap-0.5 font-bold text-[#93509e] hover:underline"
                                                  >
                                                    Fonte: {rev.source_name}
                                                    <ExternalLink class="size-2.5" />
                                                  </a>
                                                </Show>
                                              </Show>
                                            </span>
                                            <p class="text-[10px] italic text-zinc-500">
                                              Comentário externo de usuário. Não representa compra realizada na Mistura Feminina.
                                            </p>
                                          </div>
                                        </Show>
                                        <Show when={rev.variant_name}>
                                          <span class="inline-block rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-zinc-600 border border-zinc-200">
                                            Opção: {rev.variant_name}
                                          </span>
                                        </Show>
                                      </div>

                                      <Show when={rev.title}>
                                        <p class="font-bold text-[#2E0C49]">
                                          {rev.title}
                                        </p>
                                      </Show>

                                      <p class="leading-relaxed text-zinc-700">
                                        {rev.body}
                                      </p>

                                      {/* Fotos enviadas pelo comprador */}
                                      <Show when={rev.photos && rev.photos.length > 0}>
                                        <div class="pt-1">
                                          <p class="mb-1.5 text-[11px] font-bold text-zinc-600">
                                            Fotos enviadas pelo comprador:
                                          </p>
                                          <div class="flex flex-wrap gap-2">
                                            <For each={rev.photos}>
                                              {(photo) => (
                                                <button
                                                  type="button"
                                                  onClick={() => setActivePhotoModal(photo)}
                                                  class="group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 bg-white hover:border-[#93509e] transition-colors"
                                                  title="Clique para ampliar a foto"
                                                >
                                                  <img
                                                    src={photo}
                                                    alt="Foto real do produto enviada pelo comprador"
                                                    class="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                  />
                                                  <span class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                </button>
                                              )}
                                            </For>
                                          </div>
                                        </div>
                                      </Show>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>

                            <form
                              onSubmit={submitReview}
                              class="space-y-3 rounded-xl border border-zinc-200 bg-white p-4"
                            >
                              <div>
                                <p class="text-xs font-extrabold text-[#2E0C49]">
                                  Compartilhe sua experiência
                                </p>
                                <p class="text-[11px] text-zinc-500">
                                  Ajude outros profissionais da beleza a escolherem o produto ideal.
                                </p>
                              </div>

                              <div class="grid gap-2.5 sm:grid-cols-2">
                                <div>
                                  <label for="rev-author-name" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                    Seu nome *
                                  </label>
                                  <input
                                    id="rev-author-name"
                                    type="text"
                                    required
                                    placeholder="Ex.: Mariana Silva"
                                    value={revName()}
                                    onInput={(e) => setRevName(e.currentTarget.value)}
                                    class="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
                                  />
                                  <span class="mt-0.5 block text-[10px] text-zinc-400">
                                    Seu sobrenome será abreviado para proteger sua privacidade (ex.: Mariana S.)
                                  </span>
                                </div>
                                <div>
                                  <label for="rev-author-email" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                    Seu e-mail (opcional)
                                  </label>
                                  <input
                                    id="rev-author-email"
                                    type="email"
                                    placeholder="Para receber confirmação da aprovação"
                                    value={revEmail()}
                                    onInput={(e) => setRevEmail(e.currentTarget.value)}
                                    class="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div class="grid gap-2.5 sm:grid-cols-2">
                                <div>
                                  <label for="rev-rating" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                    Sua nota *
                                  </label>
                                  <select
                                    id="rev-rating"
                                    value={revRating()}
                                    onChange={(e) => setRevRating(Number(e.currentTarget.value))}
                                    class="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-xs focus:border-[#93509e] focus:outline-none"
                                  >
                                    <option value={5}>⭐⭐⭐⭐⭐ 5 estrelas — Excelente</option>
                                    <option value={4}>⭐⭐⭐⭐ 4 estrelas — Muito bom</option>
                                    <option value={3}>⭐⭐⭐ 3 estrelas — Bom</option>
                                    <option value={2}>⭐⭐ 2 estrelas — Regular</option>
                                    <option value={1}>⭐ 1 estrela — Ruim</option>
                                  </select>
                                </div>

                                <Show when={(p().variants?.length ?? 0) > 1}>
                                  <div>
                                    <label for="rev-variant" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                      Opção / Cor adquirida (opcional)
                                    </label>
                                    <select
                                      id="rev-variant"
                                      value={revVariantId()}
                                      onChange={(e) => setRevVariantId(e.currentTarget.value)}
                                      class="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-xs focus:border-[#93509e] focus:outline-none"
                                    >
                                      <option value="">Selecione a opção avaliada...</option>
                                      <For each={p().variants}>
                                        {(v) => (
                                          <option value={String(v.id)}>
                                            {v.name} {v.shade_code ? `(${v.shade_code})` : ""}
                                          </option>
                                        )}
                                      </For>
                                    </select>
                                  </div>
                                </Show>
                              </div>

                              <div>
                                <label for="rev-title" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                  Título do comentário (opcional)
                                </label>
                                <input
                                  id="rev-title"
                                  type="text"
                                  placeholder="Ex.: Secagem rápida e excelente cobertura"
                                  value={revTitle()}
                                  onInput={(e) => setRevTitle(e.currentTarget.value)}
                                  class="h-9 w-full rounded-lg border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
                                />
                              </div>

                              <div>
                                <label for="rev-body" class="mb-1 block text-[11px] font-semibold text-zinc-700">
                                  Seu depoimento *
                                </label>
                                <textarea
                                  id="rev-body"
                                  rows={3}
                                  required
                                  placeholder="Conte como foi usar este produto na sua rotina de manicure ou salão..."
                                  value={revBody()}
                                  onInput={(e) => setRevBody(e.currentTarget.value)}
                                  class="w-full rounded-lg border border-zinc-300 p-2.5 text-xs focus:border-[#93509e] focus:outline-none"
                                />
                              </div>

                              {/* Upload de Fotos de Avaliação */}
                              <div class="space-y-2 rounded-lg border border-dashed border-zinc-300 bg-[#FCF8FD] p-3">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <div class="flex items-center gap-1.5">
                                    <Camera class="size-4 text-[#93509e]" />
                                    <span class="text-xs font-bold text-[#2E0C49]">
                                      Fotos reais do produto (opcional)
                                    </span>
                                  </div>
                                  <span class="text-[11px] text-zinc-500">
                                    Até 3 fotos (PNG, JPG, WebP máx. 5 MB cada)
                                  </span>
                                </div>

                                <div class="flex flex-wrap items-center gap-2">
                                  <For each={revPhotos()}>
                                    {(photo, idx) => (
                                      <div class="relative h-14 w-14 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                                        <img src={photo} alt="Foto anexada" class="h-full w-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={() => removeReviewPhoto(idx())}
                                          aria-label="Remover foto"
                                          class="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                                        >
                                          <X class="size-2.5" />
                                        </button>
                                      </div>
                                    )}
                                  </For>

                                  <Show when={revPhotos().length < 3}>
                                    <label
                                      class="inline-flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#93509e] bg-white text-center text-[#93509e] hover:bg-[#FDF9FE] transition-colors"
                                      title="Adicionar foto"
                                    >
                                      <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        class="sr-only"
                                        disabled={revUploadingPhoto()}
                                        onChange={(e) => {
                                          const file = e.currentTarget.files?.[0];
                                          if (file) void handleUploadReviewPhoto(file);
                                          e.currentTarget.value = "";
                                        }}
                                      />
                                      <Show
                                        when={revUploadingPhoto()}
                                        fallback={
                                          <>
                                            <Plus class="size-4" />
                                            <span class="text-[9px] font-bold">Foto</span>
                                          </>
                                        }
                                      >
                                        <Loader2 class="size-4 animate-spin text-[#93509e]" />
                                      </Show>
                                    </label>
                                  </Show>
                                </div>

                                <Show when={revPhotoError()}>
                                  <p class="text-[11px] font-medium text-red-600">
                                    {revPhotoError()}
                                  </p>
                                </Show>
                              </div>

                              <label class="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={revConsent()}
                                  onChange={(e) => setRevConsent(e.currentTarget.checked)}
                                  class="mt-0.5 size-3.5 rounded border-zinc-300 accent-[#93509e]"
                                />
                                <span>
                                  Autorizo a exibição desta avaliação e fotos anexadas na página do produto da Mistura Feminina conforme a LGPD.
                                </span>
                              </label>

                              <div class="flex flex-wrap items-center gap-3 pt-1">
                                <button
                                  type="submit"
                                  disabled={revBusy() || revUploadingPhoto()}
                                  class="h-9 rounded-lg bg-[#93509e] px-6 text-xs font-bold text-white transition-colors hover:bg-[#7c3f87] disabled:opacity-60"
                                >
                                  {revBusy() ? "Enviando..." : "Publicar avaliação"}
                                </button>
                                <Show when={revMsg()}>
                                  <p
                                    role="status"
                                    class="text-xs font-medium text-emerald-700"
                                  >
                                    {revMsg()}
                                  </p>
                                </Show>
                              </div>
                            </form>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Produtos relacionados */}
                <Show
                  when={p().related_products && p().related_products.length > 0}
                >
                  <section class="mt-14 pt-6">
                    <SectionHeading title="Produtos relacionados" />
                    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      <For each={p().related_products}>
                        {(rel) => <ProductCard product={rel} />}
                      </For>
                    </div>
                  </section>
                </Show>

                {/* Produtos visualizados */}
                <Show when={viewedProducts().length > 0}>
                  <section class="mt-14 pt-4">
                    <SectionHeading title="Produtos visualizados" />

                    <div class="flex flex-wrap items-center justify-center gap-4">
                      <For each={viewedProducts()}>
                        {(item) => (
                          <Link
                            to="/produto/$slug"
                            params={{ slug: item.slug }}
                            class="flex w-full max-w-[340px] items-center gap-4 rounded-xl border border-zinc-100 bg-white p-3.5 shadow-2xs transition hover:border-zinc-200"
                          >
                            <ProductImage
                              src={item.primary_image}
                              alt=""
                              width="80"
                              height="80"
                              loading="lazy"
                              decoding="async"
                              class="h-20 w-20 shrink-0 object-contain"
                            />
                            <span class="text-xs font-bold text-[#2E0C49]">
                              {item.name}
                            </span>
                          </Link>
                        )}
                      </For>
                    </div>

                    <div class="mt-6 flex items-center justify-center gap-2 text-xs text-[#2E0C49]">
                      <span>Páginas:</span>
                      <span class="inline-flex size-6 items-center justify-center rounded-md bg-[#93509e] text-[11px] font-bold text-white">
                        1
                      </span>
                    </div>
                  </section>
                </Show>
              </div>

              <NewsletterSection />

              {/* Sticky bottom buy bar (docked above MobileBottomNav on small screens, bottom-0 on desktop) */}
              <div class="fixed inset-x-0 bottom-[53px] md:bottom-0 z-30 border-t border-zinc-200/90 bg-white/95 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-200">
                <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 sm:px-4">
                  <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <ProductImage
                      src={activeImage() || p().primary_image}
                      alt={p().name}
                      width="48"
                      height="48"
                      loading="lazy"
                      decoding="async"
                      class="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-lg border border-zinc-100 object-contain"
                    />
                    <div class="min-w-0">
                      <span class="block truncate text-xs font-semibold text-zinc-900 sm:text-sm">
                        {p().name}
                      </span>
                      <span class="block text-xs font-bold text-[#93509e] sm:hidden">
                        {formatCents(currentPriceCents())}
                      </span>
                    </div>
                  </div>

                  <div class="flex shrink-0 items-center gap-3 sm:gap-4">
                    <div class="hidden text-right sm:block">
                      <div class="text-base font-extrabold text-[#93509e] sm:text-lg">
                        {formatCents(currentPriceCents())}
                      </div>
                      <p class="flex items-center justify-end gap-1 text-[11px] text-zinc-600">
                        <CreditCard class="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          ou{" "}
                          <strong class="font-bold text-[#93509e]">
                            {installments()}x
                          </strong>{" "}
                          de{" "}
                          <strong class="font-bold text-[#93509e]">
                            {formatCents(installmentValue())}
                          </strong>{" "}
                          sem juros
                        </span>
                      </p>
                    </div>

                    <Show
                      when={inStock()}
                      fallback={
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(
                              "restock-email-input",
                            );
                            el?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                            el?.focus();
                          }}
                          class="group/notify inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3 sm:px-4 text-xs font-semibold whitespace-nowrap text-[#93509e] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#93509e] hover:text-white hover:shadow-[0_6px_16px_rgba(147,80,158,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93509e]/30"
                        >
                          <Bell
                            class="h-3.5 w-3.5 shrink-0 transition-transform duration-300 group-hover/notify:-rotate-12 group-hover/notify:scale-110"
                            aria-hidden="true"
                          />
                          <span class="whitespace-nowrap">
                            Avise-me quando voltar
                          </span>
                        </button>
                      }
                    >
                      <button
                        type="button"
                        disabled={adding()}
                        onClick={() => void handleAddToCart()}
                        class="mf-btn-buy h-9 sm:h-10 rounded-lg px-5 sm:px-8 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                      >
                        {adding() ? "ADICIONANDO..." : "COMPRAR"}
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </Show>

      {/* Lightbox para fotos enviadas por compradores */}
      <Show when={activePhotoModal()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visualizar foto do produto"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setActivePhotoModal(null)}
        >
          <div
            class="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActivePhotoModal(null)}
              aria-label="Fechar foto"
              class="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black"
            >
              <X class="size-4" />
            </button>
            <img
              src={activePhotoModal()!}
              alt="Foto em alta resolução enviada por comprador"
              class="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            />
          </div>
        </div>
      </Show>
    </StoreShell>
  );
}
