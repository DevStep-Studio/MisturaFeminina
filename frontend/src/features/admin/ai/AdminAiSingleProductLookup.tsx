import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import ExternalLink from "lucide-solid/icons/external-link";
import ImageIcon from "lucide-solid/icons/image";
import ImagePlus from "lucide-solid/icons/image-plus";
import Loader2 from "lucide-solid/icons/loader-circle";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import Sparkles from "lucide-solid/icons/sparkles";
import Trash2 from "lucide-solid/icons/trash";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl, formatCents } from "../../../lib/format";
import { ProductImage } from "../../storefront/components/ProductImage";
import {
  formatCentsToBrInput,
  parseBrazilianPriceToCents,
} from "../admin-helpers";
import { type BrandOption, type CategoryOption, makeIdempotencyKey } from "../products/types";
import {
  calculateUnitMarginPreview,
  formatBrlSigned,
  formatMarginPercentage,
  parseBrlNullableCost,
} from "../profit-math";
import {
  AdminButton,
  AdminCard,
  AdminCombobox,
  AdminField,
  AdminInput,
  AdminMultiCombobox,
  AdminTextarea,
} from "../ui";
import {
  type AiSearchConnectionStatus,
  type CatalogDuplicateCheckResponse,
  type CatalogDuplicateConflict,
  type ProductLookupCandidate,
  type ProductLookupDraft,
  type ProductLookupImageCandidate,
  type ProductLookupLocalMatch,
  type ProductLookupResponse,
  type ProductLookupSource,
} from "./ai-types";

function extractApiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const firstValidation = err.validation
      ? Object.values(err.validation).flat()[0]
      : undefined;
    if (firstValidation) return firstValidation;
    const payloadMsg = err.payload?.message;
    if (typeof payloadMsg === "string" && payloadMsg.trim()) return payloadMsg;
    if (err.message) return err.message;
  }
  return fallback;
}

export function AdminAiSingleProductLookup(props: {
  brands: BrandOption[];
  categories: CategoryOption[];
  canCostWrite: boolean;
  onOpenExistingProduct: (productId: number) => void;
  onProductSaved: (
    savedProductId: number,
    productName: string,
    stayForNext: boolean,
  ) => Promise<void> | void;
  onSwitchToBatch?: () => void;
}) {
  let searchInputRef: HTMLInputElement | undefined;
  let manualPhotoInputRef: HTMLInputElement | undefined;
  let abortController: AbortController | null = null;
  let latestLookupSeq = 0;

  // Search form fields
  const [query, setQuery] = createSignal("");
  const [brandFilter, setBrandFilter] = createSignal("");
  const [sourceUrlFilter, setSourceUrlFilter] = createSignal("");
  const [barcodeFilter, setBarcodeFilter] = createSignal("");

  // Lookup state
  const [searching, setSearching] = createSignal(false);
  const [lookupState, setLookupState] = createSignal<
    ProductLookupResponse["state"] | null
  >(null);
  const [searchStatus, setSearchStatus] =
    createSignal<AiSearchConnectionStatus | null>(null);
  const [statusBanner, setStatusBanner] = createSignal<{
    type: "info" | "warn" | "err" | "ok";
    text: string;
  } | null>(null);
  const [credentialsMissing, setCredentialsMissing] = createSignal(false);
  const [cachedNotice, setCachedNotice] = createSignal(false);
  const [localMatches, setLocalMatches] = createSignal<ProductLookupLocalMatch[]>(
    [],
  );
  const [candidates, setCandidates] = createSignal<ProductLookupCandidate[]>(
    [],
  );
  const [activeSource, setActiveSource] =
    createSignal<ProductLookupSource | null>(null);

  // Editable product draft fields
  const [draftOpen, setDraftOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [sku, setSku] = createSignal("");
  const [gtin, setGtin] = createSignal("");
  const [supplierCode, setSupplierCode] = createSignal("");
  const [powerWatts, setPowerWatts] = createSignal("");
  const [brandId, setBrandId] = createSignal("");
  const [suggestedNewBrand, setSuggestedNewBrand] = createSignal<string | null>(
    null,
  );
  const [selectedCatIds, setSelectedCatIds] = createSignal<number[]>([]);
  const [suggestedNewCat, setSuggestedNewCat] = createSignal<string | null>(
    null,
  );
  const [shortDesc, setShortDesc] = createSignal("");
  const [fullDesc, setFullDesc] = createSignal("");
  const [priceBrl, setPriceBrl] = createSignal("");
  const [costBrl, setCostBrl] = createSignal("");
  const [stockQty, setStockQty] = createSignal("");

  // Photo state (strict separation between external preview and confirmed store storage)
  const [savedImagePath, setSavedImagePath] = createSignal("");
  const [externalImageUrl, setExternalImageUrl] = createSignal<string | null>(
    null,
  );
  const [imageStatus, setImageStatus] = createSignal<string>("unavailable");
  const [requiresImageReview, setRequiresImageReview] = createSignal(false);
  const [imageWarning, setImageWarning] = createSignal<string | null>(null);
  const [imageImportBusy, setImageImportBusy] = createSignal(false);
  const [imageImportError, setImageImportError] = createSignal<string | null>(
    null,
  );
  const [imageCandidates, setImageCandidates] = createSignal<
    ProductLookupImageCandidate[]
  >([]);
  const [chooserOpen, setChooserOpen] = createSignal(false);

  // Save state
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string[]>>(
    {},
  );
  const [duplicateConflicts, setDuplicateConflicts] = createSignal<
    CatalogDuplicateConflict[]
  >([]);
  const [idempotencyKey, setIdempotencyKey] = createSignal(
    makeIdempotencyKey("ai-single-prod"),
  );
  const [lastSavedItem, setLastSavedItem] = createSignal<{
    id: number;
    name: string;
  } | null>(null);

  onMount(() => {
    requestAnimationFrame(() => searchInputRef?.focus());
  });

  onCleanup(() => {
    abortController?.abort();
  });

  const registeredBrands = createMemo(() => props.brands ?? []);
  const registeredCategories = createMemo(() => props.categories ?? []);

  const marginPreview = createMemo(() => {
    const pCents = parseBrazilianPriceToCents(priceBrl()) ?? 0;
    const costParsed = parseBrlNullableCost(costBrl());
    return calculateUnitMarginPreview({
      regularPriceCents: pCents,
      promoPriceCents: null,
      costCents: costParsed.valid ? costParsed.cents : null,
    });
  });

  function clearDraftFields() {
    setDraftOpen(false);
    setLookupState(null);
    setCandidates([]);
    setLocalMatches([]);
    setActiveSource(null);
    setCachedNotice(false);
    setCredentialsMissing(false);
    setName("");
    setSku("");
    setGtin("");
    setSupplierCode("");
    setPowerWatts("");
    setBrandId("");
    setSuggestedNewBrand(null);
    setSelectedCatIds([]);
    setSuggestedNewCat(null);
    setShortDesc("");
    setFullDesc("");
    setPriceBrl("");
    setCostBrl("");
    setStockQty("");
    setSavedImagePath("");
    setExternalImageUrl(null);
    setImageStatus("unavailable");
    setRequiresImageReview(false);
    setImageWarning(null);
    setImageImportError(null);
    setImageCandidates([]);
    setChooserOpen(false);
    setSaveError(null);
    setFieldErrors({});
    setDuplicateConflicts([]);
    setIdempotencyKey(makeIdempotencyKey("ai-single-prod"));
  }

  function applyDraftFromLookup(
    draft: ProductLookupDraft,
    source: ProductLookupSource | null,
    imgCandidates: ProductLookupImageCandidate[],
    imgStatus: string,
    needsReview: boolean,
    imgWarn: string | null,
  ) {
    setDraftOpen(true);
    setActiveSource(source);
    setName(draft.name || "");
    setSku(draft.sku || "");
    setGtin(draft.gtin || "");
    setSupplierCode(draft.supplier_code || "");
    setPowerWatts(draft.power_watts ? String(draft.power_watts) : "");
    setBrandId(draft.brand_id ? String(draft.brand_id) : "");
    setSuggestedNewBrand(draft.suggested_new_brand_name ?? null);
    setSelectedCatIds(draft.category_ids ?? []);
    setSuggestedNewCat(draft.suggested_new_category_name ?? null);
    setShortDesc(draft.short_description || "");
    setFullDesc(draft.description || "");
    setPriceBrl(
      draft.price_cents && draft.price_cents > 0
        ? formatCentsToBrInput(draft.price_cents)
        : "",
    );
    setCostBrl(
      draft.cost_cents !== null && draft.cost_cents !== undefined
        ? formatCentsToBrInput(draft.cost_cents)
        : "",
    );
    setStockQty(
      draft.stock_qty !== null && draft.stock_qty !== undefined
        ? String(draft.stock_qty)
        : "",
    );
    setSavedImagePath(draft.image_path || "");
    setExternalImageUrl(draft.image_url || null);
    setImageStatus(imgStatus);
    setRequiresImageReview(needsReview);
    setImageWarning(imgWarn);
    setImageImportError(null);
    setImageCandidates(imgCandidates);
    // Show alternative photo grid automatically only when photo needs review or is absent
    setChooserOpen(needsReview || (!draft.image_url && imgCandidates.length > 0));
    setSaveError(null);
    setFieldErrors({});
    setDuplicateConflicts([]);
    setIdempotencyKey(makeIdempotencyKey("ai-single-prod"));
  }

  function chooseProductCandidate(cand: ProductLookupCandidate) {
    setLookupState("draft_ready");
    setStatusBanner({
      type: cand.requires_image_review ? "warn" : "info",
      text: cand.requires_image_review
        ? (cand.image_warning ??
          "Produto selecionado. Confira a foto antes de concluir o cadastro.")
        : "Produto selecionado. Confira os campos, informe preço, custo e estoque e salve.",
    });
    applyDraftFromLookup(
      cand.draft,
      cand.source,
      cand.image_candidates,
      cand.image_status,
      cand.requires_image_review,
      cand.image_warning,
    );
  }

  async function runLookup(e?: Event, forceWebSearch = false) {
    e?.preventDefault();
    const q = query().trim();
    const link = sourceUrlFilter().trim();
    const bc = barcodeFilter().trim();

    if (!q && !link && !bc) {
      setStatusBanner({
        type: "err",
        text: "Digite o nome do produto ou informe um link ou código de barras para buscar.",
      });
      searchInputRef?.focus();
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const reqSeq = ++latestLookupSeq;

    setSearching(true);
    setStatusBanner(null);
    setSaveError(null);
    setFieldErrors({});
    setDuplicateConflicts([]);

    try {
      const res = await api<{ data: ProductLookupResponse }>(
        "/admin/ai/catalog/lookup",
        {
          method: "POST",
          signal: controller.signal,
          timeoutMs: 30000,
          body: {
            query: q,
            brand: brandFilter().trim() || undefined,
            source_url: link || undefined,
            barcode: bc || undefined,
            force_web_search: forceWebSearch,
          },
        },
      );

      // Ignore stale responses if the operator already launched a newer search
      if (reqSeq !== latestLookupSeq) return;

      const data = res.data;
      setLookupState(data.state);
      if (data.search_status) setSearchStatus(data.search_status);
      setCachedNotice(Boolean(data.cached));
      setCredentialsMissing(Boolean(data.credentials_missing));
      setLocalMatches(data.local_matches ?? []);
      setCandidates(data.candidates ?? []);

      if (data.state === "duplicate_found") {
        setDraftOpen(false);
        setStatusBanner({ type: "warn", text: data.message });
        return;
      }

      if (data.state === "multiple_candidates") {
        setDraftOpen(false);
        setStatusBanner({ type: "info", text: data.message });
        return;
      }

      if (data.state === "search_unavailable" || data.state === "not_found") {
        setStatusBanner({
          type: data.state === "search_unavailable" ? "err" : "warn",
          text: data.message,
        });
        if (data.draft) {
          applyDraftFromLookup(
            data.draft,
            null,
            [],
            data.image_status,
            true,
            data.image_warning,
          );
        }
        return;
      }

      if (data.draft) {
        setStatusBanner({
          type: data.requires_image_review ? "warn" : "ok",
          text: data.message,
        });
        applyDraftFromLookup(
          data.draft,
          data.source,
          data.image_candidates ?? [],
          data.image_status,
          data.requires_image_review,
          data.image_warning,
        );
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      if (reqSeq !== latestLookupSeq) return;

      const msg = extractApiMessage(
        err,
        "Serviço de busca indisponível no momento. Você pode preencher os dados manualmente abaixo.",
      );
      setLookupState("search_unavailable");
      setStatusBanner({ type: "err", text: msg });
      setDraftOpen(true);
      if (!name().trim() && q) setName(q);
      if (!gtin().trim() && bc) setGtin(bc);
    } finally {
      if (reqSeq === latestLookupSeq) {
        setSearching(false);
      }
    }
  }

  async function importExternalPhoto(
    candidateUrl: string,
    titleHint?: string,
  ): Promise<string | null> {
    setImageImportBusy(true);
    setImageImportError(null);
    try {
      const res = await api<{ data: { path: string } }>(
        "/admin/ai/catalog/import-image",
        {
          method: "POST",
          body: {
            url: candidateUrl,
            title: titleHint || name().trim() || "produto",
            alt_text: name().trim() || titleHint || undefined,
          },
        },
      );
      const localPath = res.data.path;
      setSavedImagePath(localPath);
      setExternalImageUrl(candidateUrl);
      setImageStatus("stored_local");
      setRequiresImageReview(false);
      setImageWarning(null);
      return localPath;
    } catch (err) {
      const msg = extractApiMessage(
        err,
        "O site de origem bloqueou ou falhou ao baixar esta foto. Escolha outra opção ou envie manualmente.",
      );
      setImageImportError(msg);
      setSavedImagePath("");
      setChooserOpen(true);
      return null;
    } finally {
      setImageImportBusy(false);
    }
  }

  async function handleManualPhotoFile(file: File) {
    setImageImportBusy(true);
    setImageImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", name().trim() || file.name);
      const res = await api<{ data: { path: string } }>(
        "/admin/ai/catalog/upload-image",
        {
          method: "POST",
          body: fd,
        },
      );
      setSavedImagePath(res.data.path);
      setExternalImageUrl(null);
      setImageStatus("stored_local");
      setRequiresImageReview(false);
      setImageWarning(null);
      setChooserOpen(false);
    } catch (err) {
      setImageImportError(
        extractApiMessage(
          err,
          "Falha ao enviar imagem manual. Verifique formato PNG, JPG ou WebP (máx. 5 MB).",
        ),
      );
    } finally {
      setImageImportBusy(false);
      if (manualPhotoInputRef) manualPhotoInputRef.value = "";
    }
  }

  async function submitSave(stayForNext: boolean) {
    if (saving()) return;
    setSaveError(null);
    setFieldErrors({});
    setDuplicateConflicts([]);

    const trimmedName = name().trim();
    const trimmedSku = sku().trim().toUpperCase();
    const priceCents = parseBrazilianPriceToCents(priceBrl());
    const costParsed = parseBrlNullableCost(costBrl());
    const qty = Number.parseInt(stockQty().trim() || "0", 10);

    const localErrors: Record<string, string[]> = {};
    if (!trimmedName) localErrors.name = ["Informe o nome comercial do produto."];
    if (!trimmedSku) localErrors.sku = ["Informe o SKU para salvar no catálogo."];
    if (!priceCents || priceCents <= 0) {
      localErrors.price_cents = ["Informe um preço de venda maior que R$ 0,00."];
    }
    if (props.canCostWrite && !costParsed.valid) {
      localErrors.cost_cents = [
        "Informe um custo válido (>= R$ 0,00) ou deixe em branco.",
      ];
    }
    if (!Number.isFinite(qty) || qty < 0) {
      localErrors.stock_qty = ["Informe uma quantidade de estoque válida (>= 0)."];
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setSaveError("Revise os campos obrigatórios destacados antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      // 1. Ensure any selected external photo is safely stored inside Mistura Feminina media first
      let finalLocalImagePath = savedImagePath().trim();
      const pendingExternal = externalImageUrl();
      if (!finalLocalImagePath && pendingExternal) {
        const importedPath = await importExternalPhoto(pendingExternal, trimmedName);
        if (!importedPath) {
          setSaveError(
            "Não foi possível baixar a imagem externa selecionada para o armazenamento da loja. Escolha outra candidata, envie sua própria foto ou clique em \"Remover foto pendente\" para salvar sem imagem.",
          );
          return;
        }
        finalLocalImagePath = importedPath;
      }

      // 2. Re-check SKU / barcode duplicates right before persistence
      const dupCheck = await api<{ data: CatalogDuplicateCheckResponse }>(
        "/admin/ai/catalog/check-duplicates",
        {
          method: "POST",
          body: {
            sku: trimmedSku,
            gtin: gtin().trim() || undefined,
            name: trimmedName,
          },
        },
      );
      if (dupCheck.data.has_exact_conflict && dupCheck.data.exact_conflicts.length > 0) {
        setDuplicateConflicts(dupCheck.data.exact_conflicts);
        setSaveError(
          "Encontramos um produto já cadastrado com o mesmo SKU ou código de barras. Abra o produto existente para evitar duplicidade.",
        );
        return;
      }

      // 3. Persist through the store's real /admin/products endpoint with idempotency protection
      const payload = {
        name: trimmedName,
        sku: trimmedSku,
        gtin: gtin().trim() || null,
        supplier_code: supplierCode().trim() || null,
        power_watts: powerWatts().trim()
          ? Number.parseInt(powerWatts().trim(), 10) || null
          : null,
        brand_id: brandId() ? Number(brandId()) : null,
        category_ids: selectedCatIds(),
        price_cents: priceCents,
        ...(props.canCostWrite ? { cost_cents: costParsed.cents } : {}),
        stock_qty: qty,
        short_description: shortDesc().trim() || undefined,
        description: fullDesc().trim() || undefined,
        seo_title: `${trimmedName} | Mistura Feminina Cosméticos`.slice(0, 180),
        seo_description: shortDesc().trim().slice(0, 320) || undefined,
        is_active: true,
        is_new_arrival: true,
        images: finalLocalImagePath
          ? [
              {
                path: finalLocalImagePath,
                alt_text: trimmedName,
                is_primary: true,
              },
            ]
          : [],
      };

      const res = await api<{ data: { id: number; name: string } }>(
        "/admin/products",
        {
          method: "POST",
          headers: {
            "X-Idempotency-Key": idempotencyKey(),
          },
          body: payload,
        },
      );

      const savedId = res.data.id;
      const savedTitle = res.data.name || trimmedName;

      if (stayForNext) {
        setLastSavedItem({ id: savedId, name: savedTitle });
        clearDraftFields();
        setQuery("");
        setBrandFilter("");
        setSourceUrlFilter("");
        setBarcodeFilter("");
        setStatusBanner({
          type: "ok",
          text: `Produto "${savedTitle}" cadastrado no catálogo. Pronto para pesquisar o próximo item.`,
        });
        await props.onProductSaved(savedId, savedTitle, true);
        requestAnimationFrame(() => searchInputRef?.focus());
      } else {
        await props.onProductSaved(savedId, savedTitle, false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(
          extractApiMessage(
            err,
            "Falha ao gravar o produto. Tente novamente sem perder seus dados.",
          ),
        );
        if (err.validation) setFieldErrors(err.validation);
      } else {
        setSaveError("Falha ao gravar o produto. Tente novamente sem perder seus dados.");
      }
    } finally {
      setSaving(false);
    }
  }

  const activePreviewSrc = () => {
    if (savedImagePath()) return assetUrl(savedImagePath());
    return externalImageUrl() || "";
  };

  return (
    <div class="space-y-5">
      {/* Search Card */}
      <AdminCard>
        <form onSubmit={(e) => void runLookup(e, false)} class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
                <Sparkles class="h-4 w-4 text-[#93509e]" />
                Cadastrar produto por nome com busca real na web
              </h2>
              <p class="mt-0.5 text-xs text-zinc-500">
                Pesquise pelo nome para preencher foto, ficha técnica e descrição. Preço de venda, custo e estoque ficam sempre sob controle da loja.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Show when={searchStatus()}>
                {(st) => (
                  <span
                    class={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      st().status === "connected"
                        ? "bg-emerald-50 text-emerald-700"
                        : st().has_credentials
                          ? "bg-amber-50 text-amber-800"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {st().driver_label}: {st().label}
                  </span>
                )}
              </Show>
              <Show when={props.onSwitchToBatch}>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => props.onSwitchToBatch?.()}
                >
                  Importar lista, foto ou planilha em lote
                </AdminButton>
              </Show>
            </div>
          </div>

          <Show when={lastSavedItem()}>
            {(last) => (
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-900">
                <span class="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-700" />
                  Último produto salvo: <strong>{last().name}</strong>
                </span>
                <AdminButton
                  size="sm"
                  variant="secondary"
                  onClick={() => props.onOpenExistingProduct(last().id)}
                >
                  Abrir produto salvo
                </AdminButton>
              </div>
            )}
          </Show>

          <div class="space-y-3">
            <label
              for="adm-ai-lookup-query"
              class="block text-sm font-semibold text-zinc-900"
            >
              Qual produto você quer cadastrar?
            </label>
            <div class="flex flex-col gap-2 sm:flex-row">
              <div class="relative flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  id="adm-ai-lookup-query"
                  ref={searchInputRef}
                  type="search"
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  placeholder="Cabine Sun 5 48W bivolt com temporizador"
                  class="h-11 w-full rounded-[8px] border border-zinc-300 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#93509e] focus:outline-none"
                />
              </div>
              <AdminButton
                type="submit"
                variant="primary"
                loading={searching()}
                loadingLabel="Buscando produto…"
                class="h-11 px-5"
              >
                <Search class="h-4 w-4" />
                Buscar produto
              </AdminButton>
            </div>

            <div class="grid gap-2.5 sm:grid-cols-3">
              <AdminField label="Marca (opcional)" forId="adm-ai-opt-brand">
                <AdminInput
                  id="adm-ai-opt-brand"
                  type="text"
                  value={brandFilter()}
                  onInput={(e) => setBrandFilter(e.currentTarget.value)}
                  placeholder="Ex.: SunUV, D&Z, Vòlia"
                />
              </AdminField>
              <AdminField label="Link da página (opcional)" forId="adm-ai-opt-url">
                <AdminInput
                  id="adm-ai-opt-url"
                  type="url"
                  value={sourceUrlFilter()}
                  onInput={(e) => setSourceUrlFilter(e.currentTarget.value)}
                  placeholder="https://fabricante.com.br/produto"
                />
              </AdminField>
              <AdminField
                label="Cód. barras ou fabricante (opcional)"
                forId="adm-ai-opt-barcode"
              >
                <AdminInput
                  id="adm-ai-opt-barcode"
                  type="text"
                  mono
                  value={barcodeFilter()}
                  onInput={(e) => setBarcodeFilter(e.currentTarget.value)}
                  placeholder="EAN / GTIN (não use SKU interno)"
                />
              </AdminField>
            </div>
          </div>

          <Show when={searching()}>
            <div
              role="status"
              class="flex items-center gap-2 rounded-[8px] border border-[#e4c6ea] bg-[#f5ebf7]/70 px-3.5 py-2.5 text-xs font-medium text-[#62298d]"
            >
              <Loader2 class="h-4 w-4 shrink-0 animate-spin" />
              <span>
                Verificando duplicidades no catálogo local e consultando referências reais na web…
              </span>
            </div>
          </Show>

          <Show when={!searching() && statusBanner()}>
            {(banner) => (
              <div
                role={banner().type === "err" ? "alert" : "status"}
                class={`flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3.5 py-2.5 text-xs font-medium ${
                  banner().type === "err"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : banner().type === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : banner().type === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-[#e4c6ea] bg-[#f5ebf7]/60 text-[#2e1049]"
                }`}
              >
                <span>{banner().text}</span>
                <Show when={cachedNotice()}>
                  <span class="rounded bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                    Resultado recente reaproveitado
                  </span>
                </Show>
              </div>
            )}
          </Show>

          <Show when={credentialsMissing()}>
            <div class="rounded-[8px] border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
              Pendente configuração do administrador: acesse{" "}
              <strong>Central de IA &rarr; Configurações</strong> para cadastrar{" "}
              <code class="font-mono">SERPER_API_KEY</code> ou{" "}
              <code class="font-mono">GOOGLE_SEARCH_API_KEY</code> +{" "}
              <code class="font-mono">GOOGLE_SEARCH_ENGINE_ID</code> e testar a conexão.
            </div>
          </Show>
        </form>
      </AdminCard>

      {/* Local Catalog Matches / Duplicate Banner */}
      <Show when={localMatches().length > 0}>
        <AdminCard class="border-amber-300 bg-amber-50/50">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 text-sm font-bold text-amber-950">
                <AlertTriangle class="h-4 w-4 text-amber-700" />
                <span>
                  {lookupState() === "duplicate_found"
                    ? "Produto já cadastrado no catálogo da loja"
                    : "Itens semelhantes já cadastrados na loja"}
                </span>
              </div>
              <Show when={lookupState() === "duplicate_found"}>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => void runLookup(undefined, true)}
                >
                  Mesmo assim buscar novo cadastro na web
                </AdminButton>
              </Show>
            </div>

            <div class="grid gap-2.5 sm:grid-cols-2">
              <For each={localMatches()}>
                {(match) => (
                  <div class="flex items-center justify-between gap-3 rounded-[8px] border border-amber-200 bg-white p-3 text-xs">
                    <div class="flex min-w-0 items-center gap-3">
                      <ProductImage
                        src={match.primary_image_path}
                        alt={match.name}
                        class="h-12 w-12 shrink-0 rounded-[6px] border border-zinc-200 bg-zinc-50 object-contain"
                      />
                      <div class="min-w-0">
                        <p class="truncate font-bold text-zinc-900">
                          {match.name}
                        </p>
                        <p class="font-mono text-[11px] text-zinc-600">
                          {match.sku}
                          {match.gtin ? ` · EAN ${match.gtin}` : ""}
                        </p>
                        <p class="text-[11px] text-amber-800">{match.reason}</p>
                        <p class="adm-tabular mt-0.5 text-[11px] font-semibold text-zinc-700">
                          Venda: {formatCents(match.price_cents)} · Estoque:{" "}
                          {match.stock_qty} un.
                        </p>
                      </div>
                    </div>
                    <AdminButton
                      size="sm"
                      variant="primary"
                      onClick={() => props.onOpenExistingProduct(match.id)}
                    >
                      Abrir produto existente
                    </AdminButton>
                  </div>
                )}
              </For>
            </div>
          </div>
        </AdminCard>
      </Show>

      {/* Multiple Plausible Candidates Picker (Generic Query / Ambiguity) */}
      <Show
        when={
          lookupState() === "multiple_candidates" && candidates().length > 0
        }
      >
        <AdminCard>
          <div class="space-y-3">
            <h3 class="text-sm font-bold text-zinc-900">
              Escolha a referência correta para preencher a ficha
            </h3>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <For each={candidates()}>
                {(cand) => (
                  <div class="flex flex-col justify-between gap-3 rounded-[10px] border border-zinc-200 bg-white p-3.5 text-xs hover:border-[#93509e]">
                    <div class="flex gap-3">
                      <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-zinc-200 bg-zinc-50 p-1">
                        <Show
                          when={cand.thumbnail_url}
                          fallback={<ImageIcon class="h-5 w-5 text-zinc-300" />}
                        >
                          <img
                            src={cand.thumbnail_url ?? ""}
                            alt={cand.title}
                            class="max-h-full max-w-full object-contain"
                          />
                        </Show>
                      </div>
                      <div class="min-w-0 space-y-1">
                        <p class="line-clamp-2 font-bold text-zinc-900">
                          {cand.title}
                        </p>
                        <Show when={cand.diff_badge}>
                          <span class="inline-block rounded bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-semibold text-[#62298d]">
                            {cand.diff_badge}
                          </span>
                        </Show>
                        <p class="truncate text-[11px] text-zinc-500">
                          {cand.source_domain}
                        </p>
                      </div>
                    </div>
                    <AdminButton
                      size="sm"
                      variant="primary"
                      onClick={() => chooseProductCandidate(cand)}
                      class="w-full"
                    >
                      Selecionar produto
                    </AdminButton>
                  </div>
                )}
              </For>
            </div>
          </div>
        </AdminCard>
      </Show>

      {/* Single-Screen Editable Product Sheet (Photo Left | Form Right on Desktop) */}
      <Show when={draftOpen()}>
        <div class="grid gap-5 lg:grid-cols-[310px_1fr]">
          {/* Photo Column */}
          <AdminCard class="h-fit space-y-3.5">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-zinc-900">Foto principal</h3>
              <span
                class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  savedImagePath()
                    ? "bg-emerald-50 text-emerald-700"
                    : imageStatus() === "uncertain_collection"
                      ? "bg-amber-100 text-amber-900"
                      : externalImageUrl()
                        ? "bg-[#f5ebf7] text-[#62298d]"
                        : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {savedImagePath()
                  ? "Foto salva na loja"
                  : imageStatus() === "uncertain_collection"
                    ? "Revisar foto (coleção)"
                    : externalImageUrl()
                      ? "Prévia da referência"
                      : "Foto indisponível"}
              </span>
            </div>

            <div
              class={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] border p-2 ${
                requiresImageReview() && !savedImagePath()
                  ? "border-amber-300 bg-amber-50/30"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <Show
                when={activePreviewSrc()}
                fallback={
                  <div class="flex flex-col items-center gap-2 text-center text-xs text-zinc-400">
                    <ImageIcon class="h-8 w-8 text-zinc-300" />
                    <span>Sem foto definida ainda</span>
                  </div>
                }
              >
                <img
                  src={activePreviewSrc()}
                  alt={name() || "Prévia do produto"}
                  class="max-h-full max-w-full object-contain"
                />
              </Show>
            </div>

            <Show when={imageWarning() || imageImportError()}>
              <div
                role="alert"
                class="rounded-[8px] border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"
              >
                <p class="font-medium">
                  {imageImportError() || imageWarning()}
                </p>
                <Show when={externalImageUrl() && !savedImagePath()}>
                  <button
                    type="button"
                    onClick={() => {
                      setExternalImageUrl(null);
                      setImageImportError(null);
                    }}
                    class="mt-1.5 inline-flex items-center gap-1 font-semibold text-red-700 underline"
                  >
                    <Trash2 class="h-3 w-3" />
                    Remover foto pendente para salvar sem imagem
                  </button>
                </Show>
              </div>
            </Show>

            <input
              ref={manualPhotoInputRef}
              type="file"
              accept="image/*"
              aria-label="Enviar arquivo de foto manual"
              class="sr-only"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleManualPhotoFile(file);
              }}
            />

            <div class="grid grid-cols-2 gap-2">
              <AdminButton
                size="sm"
                variant="secondary"
                disabled={imageImportBusy()}
                onClick={() => setChooserOpen((v) => !v)}
              >
                <RefreshCw class="h-3.5 w-3.5" />
                Trocar foto
              </AdminButton>
              <AdminButton
                size="sm"
                variant="secondary"
                loading={imageImportBusy()}
                loadingLabel="Enviando…"
                onClick={() => manualPhotoInputRef?.click()}
              >
                <ImagePlus class="h-3.5 w-3.5" />
                Enviar minha foto
              </AdminButton>
            </div>

            <Show when={chooserOpen() && imageCandidates().length > 0}>
              <div class="space-y-2 border-t border-zinc-100 pt-3">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Candidatas encontradas na busca
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <For each={imageCandidates()}>
                    {(img) => {
                      const isCurrent = () => externalImageUrl() === img.image_url;
                      return (
                        <button
                          type="button"
                          disabled={imageImportBusy()}
                          onClick={() =>
                            void importExternalPhoto(img.image_url, img.title)
                          }
                          title={img.title || img.domain || img.image_url}
                          class={`flex aspect-square items-center justify-center overflow-hidden rounded-[8px] border bg-white p-1 transition ${
                            isCurrent()
                              ? "border-[#93509e] ring-2 ring-[#93509e]/25"
                              : "border-zinc-200 hover:border-[#93509e]"
                          }`}
                        >
                          <img
                            src={img.thumb_url || img.image_url}
                            alt={img.title || "Opção de foto"}
                            class="max-h-full max-w-full object-contain"
                          />
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </AdminCard>

          {/* Editable Product Sheet Column */}
          <AdminCard>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitSave(false);
              }}
              class="space-y-4"
              noValidate
            >
              <Show when={saveError()}>
                <div
                  role="alert"
                  class="space-y-2 rounded-[8px] border border-red-200 bg-red-50 p-3 text-xs text-red-900"
                >
                  <p class="font-semibold">{saveError()}</p>
                  <Show when={duplicateConflicts().length > 0}>
                    <div class="flex flex-wrap gap-2 pt-1">
                      <For each={duplicateConflicts()}>
                        {(conf) => (
                          <AdminButton
                            size="sm"
                            variant="primary"
                            onClick={() => props.onOpenExistingProduct(conf.id)}
                          >
                            Abrir produto existente ({conf.sku})
                          </AdminButton>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>

              <AdminField
                label="Nome comercial"
                forId="adm-ai-prod-name"
                required
                error={fieldErrors().name?.[0] ?? null}
              >
                <AdminInput
                  id="adm-ai-prod-name"
                  type="text"
                  required
                  value={name()}
                  hasError={Boolean(fieldErrors().name?.[0])}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
              </AdminField>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <AdminCombobox
                    label="Marca"
                    placeholder="Selecione a marca cadastrada..."
                    searchPlaceholder="Buscar marca..."
                    value={brandId()}
                    options={registeredBrands().map((b) => ({
                      value: String(b.id),
                      label: b.name,
                    }))}
                    onChange={(val) => setBrandId(val)}
                  />
                  <Show when={!brandId() && suggestedNewBrand()}>
                    <p class="text-[11px] font-medium text-amber-800">
                      A fonte menciona a marca "{suggestedNewBrand()}". Confirme ou escolha uma marca cadastrada acima.
                    </p>
                  </Show>
                </div>

                <div class="space-y-1.5">
                  <AdminMultiCombobox
                    label="Categorias"
                    placeholder="Selecionar categorias..."
                    selectedValues={selectedCatIds().map(String)}
                    options={registeredCategories().map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                    onToggleValue={(val) => {
                      const cid = Number(val);
                      setSelectedCatIds((prev) =>
                        prev.includes(cid)
                          ? prev.filter((x) => x !== cid)
                          : [...prev, cid],
                      );
                    }}
                    onClearAll={() => setSelectedCatIds([])}
                  />
                  <Show
                    when={selectedCatIds().length === 0 && suggestedNewCat()}
                  >
                    <p class="text-[11px] font-medium text-amber-800">
                      Categoria sugerida pela fonte: "{suggestedNewCat()}" — escolha manualmente acima.
                    </p>
                  </Show>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <AdminField
                  label="SKU"
                  forId="adm-ai-prod-sku"
                  required
                  error={fieldErrors().sku?.[0] ?? null}
                >
                  <AdminInput
                    id="adm-ai-prod-sku"
                    type="text"
                    mono
                    value={sku()}
                    hasError={Boolean(fieldErrors().sku?.[0])}
                    onInput={(e) => setSku(e.currentTarget.value)}
                  />
                </AdminField>
                <AdminField label="Código de barras (EAN)" forId="adm-ai-prod-gtin">
                  <AdminInput
                    id="adm-ai-prod-gtin"
                    type="text"
                    mono
                    value={gtin()}
                    onInput={(e) => setGtin(e.currentTarget.value)}
                  />
                </AdminField>
                <AdminField label="Cód. fabricante" forId="adm-ai-prod-supcode">
                  <AdminInput
                    id="adm-ai-prod-supcode"
                    type="text"
                    mono
                    value={supplierCode()}
                    onInput={(e) => setSupplierCode(e.currentTarget.value)}
                  />
                </AdminField>
                <AdminField label="Potência (W)" forId="adm-ai-prod-watts">
                  <AdminInput
                    id="adm-ai-prod-watts"
                    type="number"
                    min="1"
                    value={powerWatts()}
                    placeholder="Opcional"
                    onInput={(e) => setPowerWatts(e.currentTarget.value)}
                  />
                </AdminField>
              </div>

              <AdminField label="Descrição curta" forId="adm-ai-prod-short-desc">
                <AdminInput
                  id="adm-ai-prod-short-desc"
                  type="text"
                  value={shortDesc()}
                  onInput={(e) => setShortDesc(e.currentTarget.value)}
                />
              </AdminField>

              <AdminField label="Descrição completa" forId="adm-ai-prod-desc">
                <AdminTextarea
                  id="adm-ai-prod-desc"
                  rows={5}
                  value={fullDesc()}
                  onInput={(e) => setFullDesc(e.currentTarget.value)}
                />
              </AdminField>

              <Show when={activeSource()}>
                {(src) => (
                  <div class="rounded-[8px] border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs">
                    <span class="font-semibold text-zinc-700">
                      Fonte consultada:
                    </span>{" "}
                    <a
                      href={src().url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 font-medium text-[#62298d] underline hover:text-[#93509e]"
                    >
                      <span>{src().title || src().domain}</span>
                      <ExternalLink class="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                )}
              </Show>

              {/* Store-exclusive Commercial Data: Price, Cost, Stock */}
              <div class="space-y-3 rounded-[10px] border border-zinc-200 bg-zinc-50/70 p-4">
                <div>
                  <h4 class="text-xs font-bold uppercase tracking-wide text-zinc-700">
                    Preço de venda, custo e estoque inicial
                  </h4>
                  <p class="text-[11px] text-zinc-500">
                    Preços de terceiros nunca são copiados automaticamente — informe os valores da Mistura Feminina.
                  </p>
                </div>

                <div
                  class={`grid gap-3 ${
                    props.canCostWrite ? "sm:grid-cols-3" : "sm:grid-cols-2"
                  }`}
                >
                  <AdminField
                    label="Preço de venda (R$)"
                    forId="adm-ai-prod-price"
                    required
                    error={fieldErrors().price_cents?.[0] ?? null}
                  >
                    <AdminInput
                      id="adm-ai-prod-price"
                      type="text"
                      inputMode="decimal"
                      mono
                      placeholder="Ex.: 149,90"
                      value={priceBrl()}
                      hasError={Boolean(fieldErrors().price_cents?.[0])}
                      onInput={(e) => setPriceBrl(e.currentTarget.value)}
                    />
                  </AdminField>

                  <Show when={props.canCostWrite}>
                    <AdminField
                      label="Custo unitário (R$)"
                      forId="adm-ai-prod-cost"
                      error={fieldErrors().cost_cents?.[0] ?? null}
                    >
                      <AdminInput
                        id="adm-ai-prod-cost"
                        type="text"
                        inputMode="decimal"
                        mono
                        placeholder="Opcional"
                        value={costBrl()}
                        hasError={Boolean(fieldErrors().cost_cents?.[0])}
                        onInput={(e) => setCostBrl(e.currentTarget.value)}
                      />
                    </AdminField>
                  </Show>

                  <AdminField
                    label="Estoque inicial (un.)"
                    forId="adm-ai-prod-stock"
                    required
                    error={fieldErrors().stock_qty?.[0] ?? null}
                  >
                    <AdminInput
                      id="adm-ai-prod-stock"
                      type="number"
                      min="0"
                      mono
                      placeholder="Ex.: 10"
                      value={stockQty()}
                      hasError={Boolean(fieldErrors().stock_qty?.[0])}
                      onInput={(e) => setStockQty(e.currentTarget.value)}
                    />
                  </AdminField>
                </div>

                <Show when={props.canCostWrite && marginPreview().profitCents !== null}>
                  <div class="flex flex-wrap items-center gap-4 text-xs text-zinc-700">
                    <span>
                      Lucro bruto estimado por unidade:{" "}
                      <strong
                        class={`adm-tabular ${
                          marginPreview().isLoss
                            ? "text-red-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {formatBrlSigned(marginPreview().profitCents ?? 0)}
                      </strong>
                    </span>
                    <span>
                      Margem bruta estimada:{" "}
                      <strong class="adm-tabular text-[#62298d]">
                        {formatMarginPercentage(marginPreview().marginPct)}
                      </strong>
                    </span>
                  </div>
                </Show>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2.5 border-t border-zinc-100 pt-3">
                <AdminButton
                  type="button"
                  variant="secondary"
                  loading={saving()}
                  loadingLabel="Salvando…"
                  onClick={() => void submitSave(true)}
                >
                  <Plus class="h-3.5 w-3.5" />
                  Salvar e cadastrar próximo
                </AdminButton>
                <AdminButton
                  type="submit"
                  variant="primary"
                  loading={saving()}
                  loadingLabel="Salvando…"
                >
                  <CheckCircle2 class="h-3.5 w-3.5" />
                  Salvar produto
                </AdminButton>
              </div>
            </form>
          </AdminCard>
        </div>
      </Show>
    </div>
  );
}
