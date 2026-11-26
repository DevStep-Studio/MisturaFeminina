import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Download from "lucide-solid/icons/download";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import FolderPlus from "lucide-solid/icons/folder-plus";
import { For, Show, createMemo, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";
import {
  buildCategoryHierarchyOptions,
} from "../categories/category-helpers";
import { AdminButton, AdminCombobox, AdminField, AdminInput, AdminModal } from "../ui";
import type { CategoryOption } from "./types";

interface ImportPreviewRow {
  row: number;
  sheet?: string;
  sheet_row?: number;
  sku: string;
  name: string;
  price_cents: number;
  raw_category?: string;
  category_status?: "empty" | "matched" | "ambiguous" | "unmatched";
  matched_categories?: string[];
  category_ids?: number[];
  category_suggestions?: Array<{
    id: number;
    name: string;
    slug: string;
    full_path: string;
    score?: number;
  }>;
  row_errors?: string[];
  new_cost_display?: string;
  exists?: boolean;
}

interface ImportReport {
  dry_run: boolean;
  total_rows: number;
  valid_rows?: number;
  created: number;
  updated: number;
  pending_count?: number;
  pending_rows?: Array<{
    row: number;
    sheet?: string;
    sheet_row?: number;
    name: string;
    raw_category?: string;
    reason: string;
  }>;
  errors: Array<{ row: number; message: string }>;
  preview: ImportPreviewRow[];
}

export function CatalogSpreadsheetImportPanel(props: {
  categories: CategoryOption[];
  onRefreshCategories: () => Promise<unknown> | void;
  onImported: () => Promise<unknown> | void;
}) {
  const [selectedFile, setSelectedFile] = createSignal<File | null>(null);
  const [csvContent, setCsvContent] = createSignal("");
  const [categoryOverrides, setCategoryOverrides] = createSignal<
    Record<string, number>
  >({});
  const [report, setReport] = createSignal<ImportReport | null>(null);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [successMsg, setSuccessMsg] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  // Quick category creation modal during import
  const [createCatOpen, setCreateCatOpen] = createSignal(false);
  const [createCatName, setCreateCatName] = createSignal("");
  const [createCatParentId, setCreateCatParentId] = createSignal("");
  const [createCatRowKey, setCreateCatRowKey] = createSignal<string | null>(null);
  const [createCatBusy, setCreateCatBusy] = createSignal(false);
  const [createCatErr, setCreateCatErr] = createSignal<string | null>(null);

  const hierarchyOptions = createMemo(() =>
    buildCategoryHierarchyOptions(
      props.categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? "",
        parent_id: c.parent_id ?? null,
        sort_order: c.sort_order,
        full_path: c.full_path,
      })),
    ),
  );

  async function runImport(dryRun: boolean, skipInvalid = false) {
    if (!selectedFile() && !csvContent().trim()) {
      setErrorMsg("Envie uma planilha Excel (.xlsx) / CSV ou cole o conteúdo da tabela.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let res: { data: ImportReport };
      if (selectedFile()) {
        const fd = new FormData();
        fd.append("file", selectedFile()!);
        fd.append("dry_run", dryRun ? "1" : "0");
        fd.append("skip_invalid", skipInvalid ? "1" : "0");
        fd.append("category_overrides", JSON.stringify(categoryOverrides()));
        res = await api<{ data: ImportReport }>("/admin/catalog/import-csv", {
          method: "POST",
          body: fd,
        });
      } else {
        res = await api<{ data: ImportReport }>("/admin/catalog/import-csv", {
          method: "POST",
          body: {
            csv_content: csvContent(),
            dry_run: dryRun,
            skip_invalid: skipInvalid,
            category_overrides: categoryOverrides(),
          },
        });
      }

      setReport(res.data);
      if (!res.data.dry_run) {
        const pend = res.data.pending_count ?? res.data.errors.length;
        setSuccessMsg(
          `Importação concluída: ${res.data.created} criado(s), ${res.data.updated} atualizado(s)${
            pend > 0 ? `, ${pend} mantido(s) como pendente(s)` : ""
          }.`,
        );
        await props.onImported();
      } else if (!dryRun && res.data.errors.length > 0) {
        setErrorMsg(
          "A planilha possui linhas pendentes. Corrija-as abaixo ou clique em 'Importar válidos e manter pendentes'.",
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Não foi possível processar a planilha.",
      );
    } finally {
      setBusy(false);
    }
  }

  function applyRowOverride(rowNum: number, catId: number) {
    setCategoryOverrides((prev) => ({
      ...prev,
      [`row:${rowNum}`]: catId,
    }));
    void runImport(true);
  }

  function openQuickCreateCategory(rowNum: number, rawCategory: string) {
    const parts = rawCategory
      .split(/\s*(?:>|→|\/)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    setCreateCatName(parts.length > 0 ? parts[parts.length - 1] : rawCategory);
    setCreateCatParentId("");
    setCreateCatRowKey(`row:${rowNum}`);
    setCreateCatErr(null);
    setCreateCatOpen(true);
  }

  async function saveQuickCategory(e: Event) {
    e.preventDefault();
    if (!createCatName().trim() || createCatBusy()) return;
    setCreateCatBusy(true);
    setCreateCatErr(null);
    try {
      const res = await api<{ data: { id: number } }>("/admin/categories", {
        method: "POST",
        body: {
          name: createCatName().trim(),
          parent_id: createCatParentId() ? Number(createCatParentId()) : null,
          is_active: true,
          show_in_menu: true,
        },
      });
      await props.onRefreshCategories();
      const key = createCatRowKey();
      if (key) {
        setCategoryOverrides((prev) => ({ ...prev, [key]: res.data.id }));
      }
      setCreateCatOpen(false);
      await runImport(true);
    } catch (err) {
      setCreateCatErr(
        err instanceof ApiError ? err.message : "Erro ao criar categoria.",
      );
    } finally {
      setCreateCatBusy(false);
    }
  }

  return (
    <section class="space-y-4 rounded-[12px] border border-zinc-200 bg-white p-5">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
            <FileSpreadsheet class="h-4 w-4 text-[#93509e]" />
            Importação de Produtos (Excel .xlsx e CSV)
          </h2>
          <p class="mt-0.5 text-xs text-zinc-500">
            Aceita colunas <strong>Nome</strong>, <strong>Valor</strong> e{" "}
            <strong>Categoria</strong> (ex.:{" "}
            <code>Acessórios &gt; Brocas &gt; Brocas Diamantadas</code>). Imagens não são obrigatórias e o preço de venda não sobrescreve o custo.
          </p>
        </div>
        <a
          href={`${import.meta.env.VITE_API_URL}/admin/catalog/export-csv`}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-[8px] border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          <Download class="h-3.5 w-3.5" />
          Exportar CSV atual
        </a>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2 rounded-[10px] border border-zinc-200 bg-zinc-50/50 p-3.5 text-xs">
          <label class="block font-semibold text-zinc-800">
            1. Enviar arquivo Excel (.xlsx) ou CSV (.csv)
          </label>
          <input
            type="file"
            accept=".xlsx,.csv,.txt,.tsv"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0] ?? null;
              setSelectedFile(file);
              if (file) setReport(null);
            }}
            class="block w-full text-xs text-zinc-700 file:mr-3 file:rounded-[6px] file:border-0 file:bg-[#f5ebf7] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#62298d] hover:file:bg-[#ebd9ef]"
          />
          <Show when={selectedFile()}>
            {(f) => (
              <div class="flex items-center justify-between text-[11px] text-zinc-600">
                <span>Selecionado: <strong>{f().name}</strong></span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  class="text-red-700 underline"
                >
                  Remover arquivo
                </button>
              </div>
            )}
          </Show>
        </div>

        <div class="space-y-2 text-xs">
          <label class="block font-semibold text-zinc-800">
            2. Ou colar tabela CSV diretamente
          </label>
          <textarea
            rows={4}
            placeholder={"Nome;Valor;Categoria\nBroca Diamantada Chama;24,90;Acessórios > Brocas > Brocas Diamantadas\nAcetona 500ml;19,90;Cuidados Unhas > Acetona"}
            value={csvContent()}
            onInput={(e) => setCsvContent(e.currentTarget.value)}
            class="w-full rounded-[8px] border border-zinc-300 p-2.5 font-mono text-xs focus:border-[#93509e] focus:outline-none"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <AdminButton
          variant="secondary"
          loading={busy()}
          onClick={() => void runImport(true)}
        >
          Pré-validar planilha (Prévia)
        </AdminButton>
        <AdminButton
          variant="primary"
          loading={busy()}
          disabled={!report() || (report()?.errors.length ?? 0) > 0}
          onClick={() => void runImport(false, false)}
        >
          Confirmar importação
        </AdminButton>
        <Show
          when={
            report() &&
            (report()?.errors.length ?? 0) > 0 &&
            (report()?.created ?? 0) + (report()?.updated ?? 0) > 0
          }
        >
          <AdminButton
            variant="primary"
            loading={busy()}
            onClick={() => void runImport(false, true)}
          >
            Importar válidos e manter pendentes
          </AdminButton>
        </Show>
      </div>

      <Show when={errorMsg()}>
        <div
          role="alert"
          class="rounded-[8px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
        >
          {errorMsg()}
        </div>
      </Show>

      <Show when={successMsg()}>
        <div
          role="status"
          class="rounded-[8px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
        >
          {successMsg()}
        </div>
      </Show>

      <Show when={report()}>
        {(rep) => (
          <div class="space-y-3 pt-2">
            <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
              <span>Linhas analisadas: <strong>{rep().total_rows}</strong></span>
              <span>Novos: <strong>{rep().created}</strong></span>
              <span>Atualizações: <strong>{rep().updated}</strong></span>
              <Show when={rep().errors.length > 0}>
                <span class="font-semibold text-red-700">
                  Pendências/Erros: {rep().errors.length}
                </span>
              </Show>
            </div>

            <div class="overflow-x-auto rounded-[10px] border border-zinc-200">
              <table class="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr class="border-b border-zinc-200 bg-zinc-50 text-[11px] text-zinc-600">
                    <th class="px-3 py-2">Linha / Produto</th>
                    <th class="px-3 py-2 text-right">Valor venda</th>
                    <th class="px-3 py-2 text-right">Custo</th>
                    <th class="px-3 py-2">Categoria na planilha</th>
                    <th class="px-3 py-2">Vínculo / Correção</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={rep().preview}>
                    {(row) => (
                      <tr class={(row.row_errors?.length ?? 0) > 0 ? "bg-red-50/40" : ""}>
                        <td class="px-3 py-2.5">
                          <p class="font-semibold text-zinc-900">
                            #{row.row} · {row.name || "Sem nome"}
                          </p>
                          <p class="font-mono text-[11px] text-zinc-500">
                            SKU: {row.sku}
                          </p>
                          <For each={row.row_errors ?? []}>
                            {(err) => (
                              <p class="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                                <AlertTriangle class="h-3 w-3 shrink-0" />
                                {err}
                              </p>
                            )}
                          </For>
                        </td>
                        <td class="px-3 py-2.5 text-right font-semibold tabular-nums text-zinc-900">
                          {formatCents(row.price_cents)}
                        </td>
                        <td class="px-3 py-2.5 text-right tabular-nums text-zinc-500">
                          {row.new_cost_display || "Não informado"}
                        </td>
                        <td class="px-3 py-2.5 text-zinc-700">
                          {row.raw_category || "—"}
                        </td>
                        <td class="px-3 py-2.5">
                          <Show
                            when={row.category_status === "matched"}
                            fallback={
                              <Show
                                when={row.category_status === "empty"}
                                fallback={
                                  <div class="space-y-1.5">
                                    <Show when={(row.category_suggestions?.length ?? 0) > 0}>
                                      <div class="flex flex-wrap gap-1">
                                        <For each={row.category_suggestions?.slice(0, 3)}>
                                          {(sugg) => (
                                            <button
                                              type="button"
                                              onClick={() => applyRowOverride(row.row, sugg.id)}
                                              class="rounded border border-[#e4c6ea] bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-medium text-[#62298d] hover:bg-[#ead8f0]"
                                            >
                                              Usar: {sugg.full_path}
                                            </button>
                                          )}
                                        </For>
                                      </div>
                                    </Show>

                                    <div class="flex flex-wrap items-center gap-1.5">
                                      <div class="min-w-[210px] flex-1">
                                        <AdminCombobox
                                          label=""
                                          placeholder="Vincular manualmente..."
                                          searchPlaceholder="Buscar categoria..."
                                          value={
                                            categoryOverrides()[`row:${row.row}`]
                                              ? String(categoryOverrides()[`row:${row.row}`])
                                              : ""
                                          }
                                          options={hierarchyOptions()}
                                          onChange={(val) => {
                                            if (val) applyRowOverride(row.row, Number(val));
                                          }}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openQuickCreateCategory(
                                            row.row,
                                            row.raw_category || "",
                                          )
                                        }
                                        class="inline-flex h-9 items-center gap-1 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                      >
                                        <FolderPlus class="h-3.5 w-3.5" />
                                        Criar
                                      </button>
                                    </div>
                                  </div>
                                }
                              >
                                <span class="text-zinc-400">Sem categoria</span>
                              </Show>
                            }
                          >
                            <span class="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
                              {(row.matched_categories ?? []).join(", ")}
                            </span>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Show>

      {/* Quick Create Category Modal during Spreadsheet Import */}
      <AdminModal
        open={createCatOpen()}
        title="Criar categoria na hierarquia"
        subtitle="A nova categoria ficará disponível imediatamente para esta importação"
        onClose={() => setCreateCatOpen(false)}
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setCreateCatOpen(false)}>
              Cancelar
            </AdminButton>
            <AdminButton
              type="submit"
              form="imp-quick-cat-form"
              variant="primary"
              loading={createCatBusy()}
            >
              Criar e vincular
            </AdminButton>
          </>
        }
      >
        <form
          id="imp-quick-cat-form"
          onSubmit={(e) => void saveQuickCategory(e)}
          class="space-y-3"
        >
          <Show when={createCatErr()}>
            <p class="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{createCatErr()}</p>
          </Show>
          <AdminField label="Nome da categoria" forId="imp-qc-name" required>
            <AdminInput
              id="imp-qc-name"
              required
              value={createCatName()}
              onInput={(e) => setCreateCatName(e.currentTarget.value)}
            />
          </AdminField>
          <AdminCombobox
            label="Categoria pai (opcional)"
            placeholder="Nível raiz (categoria principal)"
            searchPlaceholder="Buscar categoria pai..."
            value={createCatParentId()}
            options={hierarchyOptions()}
            onChange={(val) => setCreateCatParentId(val)}
          />
        </form>
      </AdminModal>
    </section>
  );
}
