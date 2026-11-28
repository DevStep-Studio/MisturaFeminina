import CheckCircle2 from "lucide-solid/icons/circle-check";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ExternalLink from "lucide-solid/icons/external-link";
import Image from "lucide-solid/icons/image";
import Loader2 from "lucide-solid/icons/loader-circle";
import MessageSquarePlus from "lucide-solid/icons/message-square-plus";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Star from "lucide-solid/icons/star";
import Store from "lucide-solid/icons/store";
import Upload from "lucide-solid/icons/upload";
import X from "lucide-solid/icons/x";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { api } from "../../../lib/api";
import type { ProductDetailData } from "../types";

export type ProductReviewItem = ProductDetailData["reviews"][number];

interface ProductShopeeReviewsProps {
  product: ProductDetailData;
  onReviewSubmitted?: () => void;
}

export function ProductShopeeReviews(props: ProductShopeeReviewsProps) {
  // Filtros estilo Shopee
  const [selectedFilter, setSelectedFilter] = createSignal<
    "all" | 5 | 4 | 3 | 2 | 1 | "with_photos" | "internal" | "external"
  >("all");

  // Lightbox de fotos ampliadas
  const [lightboxImages, setLightboxImages] = createSignal<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = createSignal<number>(0);

  // Formulário de envio de avaliação
  const [isFormOpen, setIsFormOpen] = createSignal(false);
  const [revRating, setRevRating] = createSignal<number>(5);
  const [revHoverRating, setRevHoverRating] = createSignal<number>(0);
  const [revName, setRevName] = createSignal("");
  const [revEmail, setRevEmail] = createSignal("");
  const [revTitle, setRevTitle] = createSignal("");
  const [revBody, setRevBody] = createSignal("");
  const [revVariantName, setRevVariantName] = createSignal("");
  const [revPhotos, setRevPhotos] = createSignal<string[]>([]);
  const [revConsent, setRevConsent] = createSignal(true);
  const [revUploadingPhoto, setRevUploadingPhoto] = createSignal(false);
  const [revPhotoError, setRevPhotoError] = createSignal<string | null>(null);
  const [revBusy, setRevBusy] = createSignal(false);
  const [revFeedback, setRevFeedback] = createSignal<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Lista de avaliações aprovadas
  const allReviews = createMemo(() => props.product.reviews || []);

  // Estatísticas e contagens reais
  const stats = createMemo(() => {
    const list = allReviews();
    const total = list.length;
    if (total === 0) {
      return {
        total: 0,
        avg: 0,
        count5: 0,
        count4: 0,
        count3: 0,
        count2: 0,
        count1: 0,
        withPhotos: 0,
        internalCount: 0,
        externalCount: 0,
      };
    }

    let sum = 0;
    let count5 = 0;
    let count4 = 0;
    let count3 = 0;
    let count2 = 0;
    let count1 = 0;
    let withPhotos = 0;
    let internalCount = 0;
    let externalCount = 0;

    for (const r of list) {
      sum += r.rating;
      if (r.rating === 5) count5++;
      else if (r.rating === 4) count4++;
      else if (r.rating === 3) count3++;
      else if (r.rating === 2) count2++;
      else if (r.rating === 1) count1++;

      if (r.photos && r.photos.length > 0) withPhotos++;
      if (r.is_external) externalCount++;
      else internalCount++;
    }

    const avg = Number((sum / total).toFixed(1));
    return {
      total,
      avg,
      count5,
      count4,
      count3,
      count2,
      count1,
      withPhotos,
      internalCount,
      externalCount,
    };
  });

  // Avaliações filtradas conforme chip ativo
  const filteredReviews = createMemo(() => {
    const list = allReviews();
    const filter = selectedFilter();

    if (filter === "all") return list;
    if (filter === "with_photos") return list.filter((r) => r.photos && r.photos.length > 0);
    if (filter === "internal") return list.filter((r) => !r.is_external);
    if (filter === "external") return list.filter((r) => r.is_external);
    if (typeof filter === "number") return list.filter((r) => r.rating === filter);
    return list;
  });

  // Gerador de avatar neutro elegante com inicial
  const getAvatarInitial = (name: string) => {
    const clean = (name || "").trim().toUpperCase();
    return clean ? clean.charAt(0) : "M";
  };

  // Abrir Lightbox
  const openLightbox = (photos: string[], index: number) => {
    setLightboxImages(photos);
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxImages([]);
    setLightboxIndex(0);
  };

  const nextLightboxImage = () => {
    const imgs = lightboxImages();
    if (imgs.length <= 1) return;
    setLightboxIndex((idx) => (idx + 1) % imgs.length);
  };

  const prevLightboxImage = () => {
    const imgs = lightboxImages();
    if (imgs.length <= 1) return;
    setLightboxIndex((idx) => (idx - 1 + imgs.length) % imgs.length);
  };

  // Suporte a teclado no Lightbox
  createEffect(() => {
    if (lightboxImages().length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextLightboxImage();
      else if (e.key === "ArrowLeft") prevLightboxImage();
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  // Upload de foto real de comprador
  const handlePhotoUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setRevPhotoError("Envie apenas arquivos de imagem (PNG, JPG, WEBP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRevPhotoError("A imagem deve ter no máximo 5 MB.");
      return;
    }

    setRevUploadingPhoto(true);
    setRevPhotoError(null);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const res = await api<{ data: { path: string } }>("/catalog/reviews/upload-photo", {
        method: "POST",
        body: formData,
        authenticated: false,
      });

      if (res.data?.path) {
        setRevPhotos((prev) => [...prev, res.data.path].slice(0, 3));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar imagem.";
      setRevPhotoError(msg);
    } finally {
      setRevUploadingPhoto(false);
      input.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setRevPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Envio de nova avaliação real pelo formulário
  const submitReview = async (e: Event) => {
    e.preventDefault();
    if (!revConsent()) {
      setRevFeedback({ type: "err", text: "Você precisa aceitar os termos para enviar a avaliação." });
      return;
    }

    setRevBusy(true);
    setRevFeedback(null);

    try {
      await api(`/catalog/products/${props.product.slug}/reviews`, {
        method: "POST",
        body: {
          author_name: revName().trim(),
          author_email: revEmail().trim() || null,
          rating: revRating(),
          title: revTitle().trim() || null,
          body: revBody().trim(),
          variant_name: revVariantName().trim() || null,
          photos: revPhotos().length > 0 ? revPhotos() : null,
          consent: revConsent(),
        },
        authenticated: false,
      });

      setRevFeedback({
        type: "ok",
        text: "Obrigada por sua avaliação! Ela foi recebida com sucesso e passará por moderação da nossa equipe antes de ser publicada.",
      });

      // Limpar campos
      setRevName("");
      setRevEmail("");
      setRevTitle("");
      setRevBody("");
      setRevPhotos([]);
      setRevRating(5);
      setRevVariantName("");

      if (props.onReviewSubmitted) props.onReviewSubmitted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível enviar sua avaliação.";
      setRevFeedback({ type: "err", text: msg });
    } finally {
      setRevBusy(false);
    }
  };

  return (
    <div class="space-y-6">
      {/* 1. Shopee Rating Overview Banner */}
      <div class="rounded-2xl border border-[#F0E5F2] bg-[#FAF6FA] p-4 sm:p-6 shadow-2xs">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Média e Estrelas Principais */}
          <div class="flex items-center gap-4">
            <div class="text-center sm:text-left">
              <div class="flex items-baseline justify-center sm:justify-start gap-1">
                <span class="text-4xl font-extrabold tracking-tight text-[#2E0C49]">
                  {stats().avg > 0 ? stats().avg : "—"}
                </span>
                <span class="text-xs font-semibold text-zinc-500">de 5</span>
              </div>
              <div class="mt-1 flex items-center justify-center sm:justify-start gap-1 text-amber-500">
                <For each={[1, 2, 3, 4, 5]}>
                  {(star) => (
                    <Star
                      class={`size-4 ${
                        star <= Math.round(stats().avg)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-zinc-200 text-zinc-200"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </For>
              </div>
              <p class="mt-1 text-xs text-zinc-600">
                {stats().total === 1
                  ? "1 avaliação verificada"
                  : `${stats().total} avaliações no total`}
              </p>
            </div>

            {/* Barra de Distribuição de Estrelas (Shopee Progress) */}
            <Show when={stats().total > 0}>
              <div class="hidden sm:block border-l border-[#EBDDEE] pl-5 space-y-1 text-[11px] text-zinc-600">
                <For each={[5, 4, 3, 2, 1] as const}>
                  {(starCount) => {
                    const count =
                      starCount === 5
                        ? stats().count5
                        : starCount === 4
                        ? stats().count4
                        : starCount === 3
                        ? stats().count3
                        : starCount === 2
                        ? stats().count2
                        : stats().count1;
                    const pct = stats().total > 0 ? Math.round((count / stats().total) * 100) : 0;
                    return (
                      <div class="flex items-center gap-2">
                        <span class="w-7 text-right font-medium">{starCount} ★</span>
                        <div class="h-2 w-24 overflow-hidden rounded-full bg-zinc-200/80">
                          <div
                            class="h-full rounded-full bg-[#93509e]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span class="w-6 text-zinc-400">{count}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Botão de Adicionar Avaliação */}
          <div>
            <button
              type="button"
              onClick={() => setIsFormOpen((prev) => !prev)}
              class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#93509e] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#7e4088] active:scale-95"
            >
              <MessageSquarePlus class="size-4" aria-hidden="true" />
              {isFormOpen() ? "Fechar formulário" : "Avaliar este produto"}
            </button>
          </div>
        </div>

        {/* 2. Chips de Filtros (Shopee Horizontal Scroll Tabs) */}
        <Show when={stats().total > 0}>
          <div class="mt-5 border-t border-[#EBDDEE] pt-4">
            <p class="mb-2 text-[11px] font-semibold text-zinc-500">Filtrar avaliações por:</p>
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar sm:flex-wrap">
              {/* Chip: Todas */}
              <button
                type="button"
                onClick={() => setSelectedFilter("all")}
                class={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedFilter() === "all"
                    ? "bg-[#93509e] text-white shadow-2xs"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                Todas ({stats().total})
              </button>

              {/* Chips por estrelas (5 a 1) */}
              <For each={[5, 4, 3, 2, 1] as const}>
                {(starVal) => {
                  const count =
                    starVal === 5
                      ? stats().count5
                      : starVal === 4
                      ? stats().count4
                      : starVal === 3
                      ? stats().count3
                      : starVal === 2
                      ? stats().count2
                      : stats().count1;
                  return (
                    <Show when={count > 0}>
                      <button
                        type="button"
                        onClick={() => setSelectedFilter(starVal)}
                        class={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          selectedFilter() === starVal
                            ? "bg-[#93509e] text-white shadow-2xs"
                            : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {starVal} Estrelas ({count})
                      </button>
                    </Show>
                  );
                }}
              </For>

              {/* Chip: Com Fotos */}
              <Show when={stats().withPhotos > 0}>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("with_photos")}
                  class={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedFilter() === "with_photos"
                      ? "bg-[#93509e] text-white shadow-2xs"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <Image class="size-3.5" aria-hidden="true" />
                  Com fotos ({stats().withPhotos})
                </button>
              </Show>

              {/* Chip: Da Mistura Feminina */}
              <Show when={stats().internalCount > 0 && stats().externalCount > 0}>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("internal")}
                  class={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedFilter() === "internal"
                      ? "bg-[#93509e] text-white shadow-2xs"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Clientes da loja ({stats().internalCount})
                </button>
              </Show>

              {/* Chip: Outra Loja */}
              <Show when={stats().externalCount > 0}>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("external")}
                  class={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedFilter() === "external"
                      ? "bg-[#93509e] text-white shadow-2xs"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <Store class="size-3" aria-hidden="true" />
                  Outra loja ({stats().externalCount})
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      {/* 3. Formulário Colapsável de Avaliação Real */}
      <Show when={isFormOpen()}>
        <form
          onSubmit={submitReview}
          class="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs"
        >
          <div>
            <h4 class="text-sm font-bold text-[#2E0C49]">Envie sua avaliação</h4>
            <p class="text-xs text-zinc-500">
              Sua opinião ajuda manicures e clientes reais a encontrarem o produto ideal.
            </p>
          </div>

          <Show when={revFeedback()}>
            {(f) => (
              <div
                class={`rounded-xl p-3 text-xs font-medium ${
                  f().type === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {f().text}
              </div>
            )}
          </Show>

          {/* Seleção Interativa de Estrelas */}
          <div>
            <label class="block text-xs font-semibold text-zinc-700 mb-1.5">Sua nota geral *</label>
            <div class="flex items-center gap-1.5">
              <For each={[1, 2, 3, 4, 5]}>
                {(star) => (
                  <button
                    type="button"
                    onClick={() => setRevRating(star)}
                    onMouseEnter={() => setRevHoverRating(star)}
                    onMouseLeave={() => setRevHoverRating(0)}
                    class="p-1 transition-transform hover:scale-110 focus:outline-none"
                    title={`Nota ${star} de 5`}
                  >
                    <Star
                      class={`size-6 ${
                        star <= (revHoverRating() || revRating())
                          ? "fill-amber-400 text-amber-400"
                          : "fill-zinc-200 text-zinc-200"
                      }`}
                    />
                  </button>
                )}
              </For>
              <span class="ml-2 text-xs font-bold text-[#2E0C49]">
                {revRating() === 5
                  ? "Excelente (5/5)"
                  : revRating() === 4
                  ? "Muito bom (4/5)"
                  : revRating() === 3
                  ? "Bom (3/5)"
                  : revRating() === 2
                  ? "Regular (2/5)"
                  : "Insatisfeita (1/5)"}
              </span>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label for="rev-author-name-shopee" class="block text-xs font-semibold text-zinc-700 mb-1">
                Seu nome completo *
              </label>
              <input
                id="rev-author-name-shopee"
                type="text"
                required
                placeholder="Ex.: Valéria Moreira"
                value={revName()}
                onInput={(e) => setRevName(e.currentTarget.value)}
                class="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
              <span class="mt-0.5 block text-[10px] text-zinc-400">
                Seu sobrenome será abreviado publicamente para proteger sua privacidade (ex.: Valéria M.).
              </span>
            </div>

            <div>
              <label for="rev-author-email-shopee" class="block text-xs font-semibold text-zinc-700 mb-1">
                E-mail (opcional)
              </label>
              <input
                id="rev-author-email-shopee"
                type="email"
                placeholder="nome@exemplo.com"
                value={revEmail()}
                onInput={(e) => setRevEmail(e.currentTarget.value)}
                class="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              />
              <span class="mt-0.5 block text-[10px] text-zinc-400">
                Não será divulgado publicamente. Usado apenas para avisar sobre a aprovação.
              </span>
            </div>
          </div>

          {/* Seleção de Variante (se o produto tiver opções) */}
          <Show when={props.product.variants && props.product.variants.length > 0}>
            <div>
              <label for="rev-variant-select" class="block text-xs font-semibold text-zinc-700 mb-1">
                Qual variação ou cor você comprou? (opcional)
              </label>
              <select
                id="rev-variant-select"
                value={revVariantName()}
                onChange={(e) => setRevVariantName(e.currentTarget.value)}
                class="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
              >
                <option value="">Selecione uma opção (ex.: Bivolt Branco, Cor 01, etc.)</option>
                <For each={props.product.variants}>
                  {(v) => <option value={v.name}>{v.name}</option>}
                </For>
              </select>
            </div>
          </Show>

          <div>
            <label for="rev-title-shopee" class="block text-xs font-semibold text-zinc-700 mb-1">
              Título da avaliação (opcional)
            </label>
            <input
              id="rev-title-shopee"
              type="text"
              placeholder="Ex.: Excelente poder de sucção na bancada!"
              value={revTitle()}
              onInput={(e) => setRevTitle(e.currentTarget.value)}
              class="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
          </div>

          <div>
            <label for="rev-body-shopee" class="block text-xs font-semibold text-zinc-700 mb-1">
              Seu comentário sincero *
            </label>
            <textarea
              id="rev-body-shopee"
              required
              rows={3}
              placeholder="Conte como foi sua experiência com o acabamento, durabilidade, facilidade de uso e aplicação..."
              value={revBody()}
              onInput={(e) => setRevBody(e.currentTarget.value)}
              class="w-full rounded-xl border border-zinc-300 p-3 text-xs leading-relaxed focus:border-[#93509e] focus:outline-none"
            />
          </div>

          {/* Upload de Fotos Reais */}
          <div>
            <label class="block text-xs font-semibold text-zinc-700 mb-1.5">
              Fotos reais do produto (até 3 imagens)
            </label>
            <div class="flex flex-wrap items-center gap-2.5">
              <For each={revPhotos()}>
                {(photo, idx) => (
                  <div class="group relative size-16 overflow-hidden rounded-xl border border-zinc-200">
                    <img src={photo} alt="Foto enviada" class="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx())}
                      class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-white shadow-xs"
                      title="Remover foto"
                    >
                      <X class="size-3" />
                    </button>
                  </div>
                )}
              </For>

              <Show when={revPhotos().length < 3}>
                <label class="flex size-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 transition hover:border-[#93509e] hover:bg-[#FAF6FA] hover:text-[#93509e]">
                  <Show when={revUploadingPhoto()} fallback={<Upload class="size-5" />}>
                    <Loader2 class="size-5 animate-spin text-[#93509e]" />
                  </Show>
                  <span class="mt-1 text-[9px] font-bold">Adicionar</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={revUploadingPhoto()}
                    onChange={handlePhotoUpload}
                    class="sr-only"
                  />
                </label>
              </Show>
            </div>
            <Show when={revPhotoError()}>
              {(err) => <p class="mt-1 text-[11px] text-red-600 font-medium">{err()}</p>}
            </Show>
          </div>

          <label class="flex items-start gap-2 pt-1 text-xs text-zinc-600 cursor-pointer">
            <input
              type="checkbox"
              checked={revConsent()}
              onChange={(e) => setRevConsent(e.currentTarget.checked)}
              class="mt-0.5 rounded border-zinc-300 text-[#93509e] focus:ring-[#93509e]"
            />
            <span>
              Declaro que esta avaliação representa minha experiência real com o produto e autorizo sua
              exibição na Mistura Feminina.
            </span>
          </label>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              class="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={revBusy()}
              class="inline-flex items-center gap-2 rounded-xl bg-[#93509e] px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#7e4088] disabled:opacity-50"
            >
              <Show when={revBusy()}>
                <Loader2 class="size-3.5 animate-spin" />
              </Show>
              Enviar avaliação
            </button>
          </div>
        </form>
      </Show>

      {/* 4. Lista de Avaliações em Formato Shopee */}
      <Show
        when={filteredReviews().length > 0}
        fallback={
          <div class="rounded-2xl border border-dashed border-zinc-200 bg-white py-12 px-4 text-center">
            <div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#F6EDF8] text-[#93509e]">
              <Star class="size-6 fill-[#93509e]" />
            </div>
            <h4 class="text-sm font-bold text-[#2E0C49]">
              {selectedFilter() === "all"
                ? "Ainda não há avaliações para este item"
                : "Nenhuma avaliação encontrada com o filtro selecionado"}
            </h4>
            <p class="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
              {selectedFilter() === "all"
                ? "Seja a primeira a opinar e compartilhe sua experiência com outras profissionais da beleza!"
                : "Tente selecionar outro filtro de estrelas ou exibir todas as avaliações."}
            </p>
            <Show when={selectedFilter() !== "all"}>
              <button
                type="button"
                onClick={() => setSelectedFilter("all")}
                class="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-[#93509e] hover:bg-zinc-50"
              >
                Limpar filtros e ver todas
              </button>
            </Show>
          </div>
        }
      >
        <ul class="space-y-4">
          <For each={filteredReviews()}>
            {(rev) => (
              <li class="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-2xs space-y-3 transition-shadow hover:shadow-xs">
                {/* Linha Superior: Avatar Neutro, Nome, Estrelas e Badges */}
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    {/* Avatar Neutro Shopee com Inicial */}
                    <div
                      class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F6EDF8] border border-[#EAD4EC] text-xs font-bold text-[#93509e] select-none"
                      aria-hidden="true"
                    >
                      {getAvatarInitial(rev.author_name)}
                    </div>

                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-bold text-xs sm:text-sm text-[#2E0C49] truncate">
                          {rev.author_name}
                        </span>

                        {/* Badges Discretas (Substituição Limpa do Disclaimer Poluído) */}
                        <Show when={rev.is_verified_purchase}>
                          <span class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 class="size-3" aria-hidden="true" />
                            Compra verificada
                          </span>
                        </Show>

                        <Show when={rev.is_external}>
                          <span class="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 border border-zinc-200/80">
                            <Store class="size-3 text-zinc-400" aria-hidden="true" />
                            Avaliação de outra loja
                            <Show when={rev.source_name}>
                              <span class="text-zinc-400">•</span>
                              <Show
                                when={rev.source_url}
                                fallback={<span class="text-zinc-500">{rev.source_name}</span>}
                              >
                                <a
                                  href={rev.source_url!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-[#93509e] hover:underline inline-flex items-center gap-0.5 font-semibold"
                                  title={`Ver avaliação original em ${rev.source_name}`}
                                >
                                  {rev.source_name}
                                  <ExternalLink class="size-2.5" />
                                </a>
                              </Show>
                            </Show>
                          </span>
                        </Show>
                      </div>

                      {/* Estrelas + Data */}
                      <div class="mt-1 flex items-center gap-2 text-xs">
                        <div class="flex items-center gap-0.5 text-amber-400">
                          <For each={[1, 2, 3, 4, 5]}>
                            {(s) => (
                              <Star
                                class={`size-3.5 ${
                                  s <= rev.rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "fill-zinc-200 text-zinc-200"
                                }`}
                                aria-hidden="true"
                              />
                            )}
                          </For>
                        </div>
                        <Show when={rev.created_at}>
                          <span class="text-[11px] text-zinc-400">
                            {new Date(rev.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </Show>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Variação Comprada (apenas quando verdadeira) */}
                <Show when={rev.variant_name}>
                  <div class="pt-0.5">
                    <span class="inline-block rounded-md bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 border border-zinc-200/70">
                      Variação: <strong class="text-zinc-800">{rev.variant_name}</strong>
                    </span>
                  </div>
                </Show>

                {/* Título do Comentário */}
                <Show when={rev.title}>
                  <h5 class="text-xs sm:text-sm font-bold text-[#2E0C49] pt-0.5">{rev.title}</h5>
                </Show>

                {/* Corpo do Comentário com Leitura Confortável */}
                <p class="text-xs sm:text-sm leading-relaxed text-zinc-700 whitespace-pre-line">
                  {rev.body}
                </p>

                {/* Miniaturas de Fotos Reais com Clique para Ampliar */}
                <Show when={rev.photos && rev.photos.length > 0}>
                  <div class="pt-1.5">
                    <div class="flex flex-wrap gap-2">
                      <For each={rev.photos}>
                        {(photo, pIdx) => (
                          <button
                            type="button"
                            onClick={() => openLightbox(rev.photos!, pIdx())}
                            class="group relative size-16 sm:size-20 overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-[#93509e] hover:shadow-xs active:scale-95"
                            title="Clique para ampliar a foto em alta resolução"
                          >
                            <img
                              src={photo}
                              alt="Foto real enviada pelo comprador"
                              class="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                          </button>
                        )}
                      </For>
                    </div>
                    <p class="mt-1 text-[10px] text-zinc-400">Clique na foto para ampliar</p>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* 5. Lightbox Modal para Fotos de Avaliações */}
      <Show when={lightboxImages().length > 0}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto da avaliação em tamanho real"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={closeLightbox}
        >
          <div
            class="relative max-h-[90vh] max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-2xl bg-zinc-900/90 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão Fechar */}
            <button
              type="button"
              onClick={closeLightbox}
              class="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black"
              title="Fechar (Esc)"
            >
              <X class="size-5" />
            </button>

            {/* Imagem Ampliada */}
            <div class="flex items-center justify-center p-2 sm:p-4">
              <img
                src={lightboxImages()[lightboxIndex()]}
                alt="Foto em alta resolução da avaliação"
                class="max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
              />
            </div>

            {/* Controles de Navegação (Prev / Next) se houver mais de 1 foto */}
            <Show when={lightboxImages().length > 1}>
              <div class="absolute inset-y-0 left-3 flex items-center">
                <button
                  type="button"
                  onClick={prevLightboxImage}
                  class="flex size-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black"
                  title="Foto anterior (Seta esquerda)"
                >
                  <ChevronLeft class="size-6" />
                </button>
              </div>

              <div class="absolute inset-y-0 right-3 flex items-center">
                <button
                  type="button"
                  onClick={nextLightboxImage}
                  class="flex size-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black"
                  title="Próxima foto (Seta direita)"
                >
                  <ChevronRight class="size-6" />
                </button>
              </div>

              {/* Contador de Fotos */}
              <div class="absolute bottom-3 inset-x-0 flex justify-center">
                <span class="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                  {lightboxIndex() + 1} de {lightboxImages().length}
                </span>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
