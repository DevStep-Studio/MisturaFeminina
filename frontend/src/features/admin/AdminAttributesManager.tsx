import { For, Show, createResource, createSignal } from "solid-js";
import { Plus, Sliders, Tag, Trash2 } from "lucide-solid";
import { ApiError, api } from "@/lib/api";

export interface AdminAttributeValue {
  id: number;
  attribute_id: number;
  value: string;
  slug: string;
  color_hex: string | null;
  sort_order: number;
}

export interface AdminAttribute {
  id: number;
  name: string;
  slug: string;
  display_type: string;
  is_filterable: boolean;
  is_comparable: boolean;
  unit: string | null;
  sort_order: number;
  values: AdminAttributeValue[];
}

export interface AdminCategoryOption {
  id: number;
  name: string;
  slug: string;
  attributes?: AdminAttribute[];
}

export function AdminAttributesManager(props: {
  categories: AdminCategoryOption[];
  onRefreshCategories?: () => Promise<void> | void;
}) {
  const [attributes, { refetch }] = createResource(async () => {
    const res = await api<{ data: AdminAttribute[] }>("/admin/attributes");
    return res.data || [];
  });

  const [attrName, setAttrName] = createSignal("");
  const [attrSlug, setAttrSlug] = createSignal("");
  const [displayType, setDisplayType] = createSignal("text");
  const [unit, setUnit] = createSignal("");
  const [isFilterable, setIsFilterable] = createSignal(true);
  const [isComparable, setIsComparable] = createSignal(true);
  const [rawValues, setRawValues] = createSignal("");

  const [selectedCategoryId, setSelectedCategoryId] = createSignal<number | "">(
    "",
  );
  const [selectedAttrIds, setSelectedAttrIds] = createSignal<number[]>([]);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  async function handleCreateAttribute(e: Event) {
    e.preventDefault();
    if (!attrName().trim()) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const parsedValues = rawValues()
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((value, idx) => ({ value, sort_order: idx + 1 }));

      await api("/admin/attributes", {
        method: "POST",
        body: {
          name: attrName().trim(),
          slug: attrSlug().trim() || undefined,
          display_type: displayType(),
          unit: unit().trim() || undefined,
          is_filterable: isFilterable(),
          is_comparable: isComparable(),
          values: parsedValues,
        },
      });
      setAttrName("");
      setAttrSlug("");
      setUnit("");
      setRawValues("");
      setFeedback("Atributo cadastrado com sucesso.");
      await refetch();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar o atributo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleAttributeFlag(
    attr: AdminAttribute,
    field: "is_filterable" | "is_comparable",
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/admin/attributes/${attr.id}`, {
        method: "PUT",
        body: {
          name: attr.name,
          is_filterable:
            field === "is_filterable"
              ? !attr.is_filterable
              : attr.is_filterable,
          is_comparable:
            field === "is_comparable"
              ? !attr.is_comparable
              : attr.is_comparable,
        },
      });
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAttribute(id: number) {
    if (
      !confirm("Remover este atributo? Vínculos em filtros serão apagados.")
    ) {
      return;
    }
    await api(`/admin/attributes/${id}`, { method: "DELETE" });
    await refetch();
  }

  function handleSelectCategory(catIdStr: string) {
    if (!catIdStr) {
      setSelectedCategoryId("");
      setSelectedAttrIds([]);
      return;
    }
    const id = Number(catIdStr);
    setSelectedCategoryId(id);
    const cat = props.categories.find((c) => c.id === id);
    const linked = (cat?.attributes ?? []).map((a) => a.id);
    setSelectedAttrIds(linked);
  }

  function toggleCategoryAttr(attrId: number) {
    setSelectedAttrIds((prev) =>
      prev.includes(attrId)
        ? prev.filter((id) => id !== attrId)
        : [...prev, attrId],
    );
  }

  async function saveCategoryMapping(e: Event) {
    e.preventDefault();
    const catId = selectedCategoryId();
    if (!catId) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      await api(`/admin/categories/${catId}/attributes`, {
        method: "PUT",
        body: {
          attributes: selectedAttrIds().map((attributeId, idx) => ({
            attribute_id: attributeId,
            is_filterable: true,
            is_comparable: true,
            sort_order: idx + 1,
          })),
        },
      });
      setFeedback("Atributos contextuais da categoria atualizados!");
      if (props.onRefreshCategories) {
        await props.onRefreshCategories();
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível vincular atributos à categoria.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div class="flex items-center gap-2">
          <Tag class="h-4 w-4 text-[#93509e]" />
          <h2 class="text-base font-bold text-zinc-900">
            Atributos Técnicos, Filtros &amp; Comparador
          </h2>
        </div>

        <form
          onSubmit={(e) => void handleCreateAttribute(e)}
          class="space-y-2.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-sm"
        >
          <div class="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder="Nome (ex.: Potência, Acabamento)"
              value={attrName()}
              onInput={(e) => setAttrName(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs"
            />
            <input
              type="text"
              placeholder="Slug (opcional)"
              value={attrSlug()}
              onInput={(e) => setAttrSlug(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs"
            />
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <select
              value={displayType()}
              onChange={(e) => setDisplayType(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs"
            >
              <option value="text">Texto / Pill</option>
              <option value="color_swatch">Amostra de Cor</option>
              <option value="select">Lista</option>
            </select>
            <input
              type="text"
              placeholder="Unidade (ex.: W, ml, g)"
              value={unit()}
              onInput={(e) => setUnit(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs"
            />
          </div>
          <input
            type="text"
            placeholder="Valores separados por vírgula (ex.: 48W, 268W ou Cremoso, Cintilante)"
            value={rawValues()}
            onInput={(e) => setRawValues(e.currentTarget.value)}
            class="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs"
          />
          <div class="flex flex-wrap items-center gap-4 text-xs">
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isFilterable()}
                onChange={(e) => setIsFilterable(e.currentTarget.checked)}
              />
              Usar em filtros
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isComparable()}
                onChange={(e) => setIsComparable(e.currentTarget.checked)}
              />
              Exibir no comparador
            </label>
          </div>
          <button
            type="submit"
            disabled={busy()}
            class="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87]"
          >
            <Plus class="h-3.5 w-3.5" />
            Adicionar atributo
          </button>
        </form>

        <Show when={feedback()}>
          <p class="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {feedback()}
          </p>
        </Show>
        <Show when={error()}>
          <p class="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error()}
          </p>
        </Show>

        <ul class="divide-y divide-zinc-100 text-xs">
          <For each={attributes() ?? []}>
            {(attr) => (
              <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p class="font-bold text-zinc-900">
                    {attr.name}
                    <Show when={attr.unit}> ({attr.unit})</Show>
                  </p>
                  <p class="text-[11px] text-zinc-500">
                    /{attr.slug} •{" "}
                    {attr.values.map((v) => v.value).join(", ") ||
                      "Sem valores"}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void toggleAttributeFlag(attr, "is_filterable")
                    }
                    class={`rounded px-2 py-0.5 font-semibold ${
                      attr.is_filterable
                        ? "bg-purple-100 text-[#93509e]"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    Filtro
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleAttributeFlag(attr, "is_comparable")
                    }
                    class={`rounded px-2 py-0.5 font-semibold ${
                      attr.is_comparable
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    Comparador
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAttribute(attr.id)}
                    aria-label={`Remover ${attr.name}`}
                    class="rounded p-1 text-zinc-400 hover:text-red-600"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div class="flex items-center gap-2">
          <Sliders class="h-4 w-4 text-[#93509e]" />
          <h2 class="text-base font-bold text-zinc-900">
            Filtros Contextuais por Categoria
          </h2>
        </div>
        <p class="text-xs text-zinc-600">
          Defina quais filtros aparecem na barra lateral quando a cliente visita
          uma categoria específica.
        </p>

        <form onSubmit={(e) => void saveCategoryMapping(e)} class="space-y-3">
          <select
            value={selectedCategoryId()}
            onChange={(e) => handleSelectCategory(e.currentTarget.value)}
            class="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
          >
            <option value="">Selecione uma categoria...</option>
            <For each={props.categories}>
              {(cat) => (
                <option value={cat.id}>
                  {cat.name} (/{cat.slug})
                </option>
              )}
            </For>
          </select>

          <Show when={selectedCategoryId()}>
            <div class="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
              <For each={attributes() ?? []}>
                {(attr) => (
                  <label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={selectedAttrIds().includes(attr.id)}
                      onChange={() => toggleCategoryAttr(attr.id)}
                      class="accent-[#93509e]"
                    />
                    <span>{attr.name}</span>
                  </label>
                )}
              </For>
            </div>
            <button
              type="submit"
              disabled={busy()}
              class="h-10 rounded-lg bg-[#93509e] px-5 text-xs font-bold text-white hover:bg-[#7c3f87]"
            >
              Salvar atributos da categoria
            </button>
          </Show>
        </form>
      </section>
    </div>
  );
}
