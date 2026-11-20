import { For, Show, createResource, createSignal } from "solid-js";
import { BellRing, Trash2 } from "lucide-solid";
import { api } from "@/lib/api";

interface CustomerRestockAlert {
  id: number;
  channel: string;
  status: string;
  notified_at: string | null;
  created_at: string;
  product: { id: number; name: string; slug: string } | null;
  variant: {
    id: number;
    name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
  } | null;
}

export function AccountRestockAlertsTab() {
  const [alerts, { refetch }] = createResource(async () => {
    const res = await api<{ data: CustomerRestockAlert[] }>(
      "/account/restock-alerts",
    );
    return res.data || [];
  });
  const [busyId, setBusyId] = createSignal<number | null>(null);

  async function cancelAlert(id: number) {
    setBusyId(id);
    try {
      await api(`/account/restock-alerts/${id}`, { method: "DELETE" });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section class="rounded-xl border border-zinc-200 bg-white p-5">
      <div class="flex items-center gap-2">
        <BellRing class="h-5 w-5 text-[#93509e]" />
        <h2 class="text-lg font-bold text-zinc-900">
          Meus Avisos de Reposição (Avise-me)
        </h2>
      </div>
      <p class="mt-1 text-xs text-zinc-600">
        Acompanhe ou cancele os alertas cadastrados por tonalidade.
      </p>

      <Show
        when={(alerts()?.length ?? 0) > 0}
        fallback={
          <p class="mt-4 text-sm text-zinc-600">
            Você ainda não cadastrou nenhum aviso de tonalidade esgotada.
          </p>
        }
      >
        <ul class="mt-4 divide-y divide-zinc-200 text-sm">
          <For each={alerts() ?? []}>
            {(alert) => (
              <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p class="font-bold text-zinc-900">
                    {alert.product?.name || "Produto"}
                  </p>
                  <p class="text-xs text-zinc-600">
                    {alert.variant ? (
                      <>
                        Tonalidade: {alert.variant.name}{" "}
                        {alert.variant.shade_code
                          ? `(${alert.variant.shade_code})`
                          : ""}{" "}
                        • SKU {alert.variant.sku}
                      </>
                    ) : (
                      "Variante padrão"
                    )}
                  </p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">
                    Status:{" "}
                    <strong class="uppercase text-[#93509e]">
                      {alert.status === "pending"
                        ? "Aguardando reposição"
                        : alert.status === "notified"
                          ? "Notificado!"
                          : "Cancelado"}
                    </strong>{" "}
                    • Canal: {alert.channel}
                  </p>
                </div>
                <Show when={alert.status === "pending"}>
                  <button
                    type="button"
                    disabled={busyId() === alert.id}
                    onClick={() => void cancelAlert(alert.id)}
                    class="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    Cancelar aviso
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
