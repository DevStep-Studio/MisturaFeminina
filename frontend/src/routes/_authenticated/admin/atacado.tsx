import { createFileRoute } from "@tanstack/solid-router";
import BarChart3 from "lucide-solid/icons/chart-column";
import Boxes from "lucide-solid/icons/boxes";
import Calculator from "lucide-solid/icons/calculator";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import FolderTree from "lucide-solid/icons/folder-tree";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import Users from "lucide-solid/icons/users";
import { Show, createSignal } from "solid-js";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminWholesaleBulkGrid } from "../../../features/admin/wholesale/AdminWholesaleBulkGrid";
import { AdminWholesaleGroupsPanel } from "../../../features/admin/wholesale/AdminWholesaleGroupsPanel";
import { AdminWholesaleOverview } from "../../../features/admin/wholesale/AdminWholesaleOverview";
import { AdminWholesaleReportsPanel } from "../../../features/admin/wholesale/AdminWholesaleReportsPanel";
import { AdminWholesaleResellersPanel } from "../../../features/admin/wholesale/AdminWholesaleResellersPanel";
import { AdminWholesaleRulesPanel } from "../../../features/admin/wholesale/AdminWholesaleRulesPanel";
import { AdminWholesaleSimulatorPanel } from "../../../features/admin/wholesale/AdminWholesaleSimulatorPanel";

type WholesaleTab =
  | "overview"
  | "rules"
  | "bulk"
  | "groups"
  | "resellers"
  | "simulator"
  | "reports";

export const Route = createFileRoute("/_authenticated/admin/atacado")({
  component: AdminWholesalePage,
});

function AdminWholesalePage() {
  const [activeTab, setActiveTab] = createSignal<WholesaleTab>("overview");

  return (
    <AdminLayout
      title="Central de Atacado"
      subtitle="Gestão completa de vendas em atacado e varejo: precificação por faixas de quantidade, agrupamento de tonalidades, revendedores e simulador"
      permission="wholesale.view"
    >
      <div class="space-y-6">
        {/* Tab Navigation */}
        <div class="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "overview"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <LayoutDashboard class="size-4" />
            <span>Visão Geral</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "rules"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Boxes class="size-4" />
            <span>Regras & Tiers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "bulk"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <FileSpreadsheet class="size-4" />
            <span>Edição em Massa (Excel)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("groups")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "groups"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <FolderTree class="size-4" />
            <span>Grupos Comerciais</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("resellers")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "resellers"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Users class="size-4" />
            <span>Revendedores & Salões</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("simulator")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "simulator"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Calculator class="size-4" />
            <span>Simulador</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab() === "reports"
                ? "bg-[#93509e] text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <BarChart3 class="size-4" />
            <span>Relatórios & CSV</span>
          </button>
        </div>

        {/* Tab Panels */}
        <Show when={activeTab() === "overview"}>
          <AdminWholesaleOverview
            onNavigateTab={(tab) => setActiveTab(tab as WholesaleTab)}
          />
        </Show>

        <Show when={activeTab() === "rules"}>
          <AdminWholesaleRulesPanel />
        </Show>

        <Show when={activeTab() === "bulk"}>
          <AdminWholesaleBulkGrid />
        </Show>

        <Show when={activeTab() === "groups"}>
          <AdminWholesaleGroupsPanel />
        </Show>

        <Show when={activeTab() === "resellers"}>
          <AdminWholesaleResellersPanel />
        </Show>

        <Show when={activeTab() === "simulator"}>
          <AdminWholesaleSimulatorPanel />
        </Show>

        <Show when={activeTab() === "reports"}>
          <AdminWholesaleReportsPanel />
        </Show>
      </div>
    </AdminLayout>
  );
}
