import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import MessageCircle from "lucide-solid/icons/message-circle";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Sparkles from "lucide-solid/icons/sparkles";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import { For, Show, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";

const FAQ_PROMPTS = [
  "Onde está o pedido?",
  "O pagamento foi aprovado?",
  "Quando será enviado?",
  "Houve problema com o pedido?",
  "Preparar resposta sobre atraso",
  "Preparar resposta sobre troca",
] as const;

export function AdminOrderAiAssistantPanel(props: {
  orderId: number;
  onNoteSaved?: () => Promise<void> | void;
}) {
  const [open, setOpen] = createSignal(false);
  const [instruction, setInstruction] = createSignal(
    "Prepare uma resposta informando a situação da entrega.",
  );
  const [toneLength, setToneLength] = createSignal<
    "short" | "normal" | "detailed"
  >("normal");
  const [replyText, setReplyText] = createSignal("");
  const [warnings, setWarnings] = createSignal<string[]>([]);
  const [whatsappUrl, setWhatsappUrl] = createSignal("");
  const [executionMode, setExecutionMode] = createSignal("");
  const [summaryBullets, setSummaryBullets] = createSignal<string[]>([]);
  const [occFindings, setOccFindings] = createSignal<string[]>([]);
  const [copied, setCopied] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function generateReply(saveNote = false) {
    setBusy(true);
    setError(null);
    setOpen(true);
    try {
      const res = await api<{
        data: {
          reply_text: string;
          warnings: string[];
          whatsapp_url: string;
          execution_mode: string;
        };
      }>(`/admin/ai/support/orders/${props.orderId}/reply`, {
        method: "POST",
        body: {
          instruction: instruction().trim(),
          tone_length: toneLength(),
          save_internal_note: saveNote,
        },
      });
      setReplyText(res.data.reply_text);
      setWarnings(res.data.warnings ?? []);
      setWhatsappUrl(res.data.whatsapp_url ?? "");
      setExecutionMode(res.data.execution_mode ?? "");
      if (saveNote) {
        await props.onNoteSaved?.();
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível preparar a resposta com IA.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runSummary() {
    setBusy(true);
    setOpen(true);
    try {
      const res = await api<{ data: { summary_bullets: string[] } }>(
        `/admin/ai/support/orders/${props.orderId}/summarize`,
        { method: "POST" },
      );
      setSummaryBullets(res.data.summary_bullets ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function runOccurrencesAnalysis() {
    setBusy(true);
    setOpen(true);
    try {
      const res = await api<{ data: { findings: string[] } }>(
        `/admin/ai/support/orders/${props.orderId}/analyze-occurrences`,
        { method: "POST" },
      );
      setOccFindings(res.data.findings ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    if (!replyText().trim()) return;
    await navigator.clipboard.writeText(replyText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="space-y-3 rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-3.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5 font-extrabold text-[#2E0C49]">
          <Sparkles class="size-4 text-[#93509e]" />
          Assistente de Atendimento (IA)
        </span>
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy()}
            onClick={() => void generateReply(false)}
            class="rounded-md bg-[#93509e] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#7c3f87] disabled:opacity-50"
          >
            Preparar resposta com IA
          </button>
          <button
            type="button"
            disabled={busy()}
            onClick={() => void runSummary()}
            class="rounded-md border border-[#DFC2E3] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2E0C49] hover:bg-zinc-50"
          >
            Resumir histórico
          </button>
          <button
            type="button"
            disabled={busy()}
            onClick={() => void runOccurrencesAnalysis()}
            class="rounded-md border border-[#DFC2E3] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2E0C49] hover:bg-zinc-50"
          >
            Analisar ocorrência
          </button>
        </div>
      </div>

      <Show when={open()}>
        <div class="space-y-3 border-t border-[#DFC2E3] pt-3">
          <div class="flex flex-wrap gap-1">
            <For each={FAQ_PROMPTS}>
              {(prompt) => (
                <button
                  type="button"
                  onClick={() => {
                    setInstruction(prompt);
                    void generateReply(false);
                  }}
                  class="rounded-full border border-[#DFC2E3] bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[#93509e] hover:bg-[#F3E2F6]"
                >
                  {prompt}
                </button>
              )}
            </For>
          </div>

          <div class="flex flex-wrap gap-2">
            <input
              type="text"
              value={instruction()}
              onInput={(e) => setInstruction(e.currentTarget.value)}
              placeholder='Ex.: "Deixe mais curta e simpática"'
              class="h-8 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
            />
            <select
              value={toneLength()}
              onChange={(e) =>
                setToneLength(
                  e.currentTarget.value as "short" | "normal" | "detailed",
                )
              }
              class="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs"
            >
              <option value="short">Curta</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detalhada</option>
            </select>
            <button
              type="button"
              disabled={busy()}
              onClick={() => void generateReply(false)}
              class="inline-flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-3 text-[11px] font-bold text-white"
            >
              <RefreshCw class="size-3" />
              Refazer
            </button>
          </div>

          <Show when={error()}>
            <p class="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-700">
              {error()}
            </p>
          </Show>

          <Show when={warnings().length > 0}>
            <div class="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
              <For each={warnings()}>
                {(w) => (
                  <p class="flex items-start gap-1.5">
                    <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-amber-700" />
                    <span>{w}</span>
                  </p>
                )}
              </For>
            </div>
          </Show>

          <Show when={replyText()}>
            <div class="space-y-2">
              <textarea
                rows={4}
                value={replyText()}
                onInput={(e) => setReplyText(e.currentTarget.value)}
                class="w-full rounded-lg border border-zinc-300 bg-white p-2.5 text-xs"
              />
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-[10px] text-zinc-500">
                  Modo: {executionMode() || "ferramentas do pedido"} · Nenhuma
                  mensagem é enviada automaticamente sem seu clique.
                </span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyReply()}
                    class="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold"
                  >
                    <Show when={copied()} fallback={<Copy class="size-3" />}>
                      <Check class="size-3 text-emerald-700" />
                    </Show>
                    {copied() ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void generateReply(true)}
                    class="rounded border border-[#93509e] bg-white px-2.5 py-1 text-[11px] font-bold text-[#93509e]"
                  >
                    Salvar como nota interna
                  </button>
                  <Show when={whatsappUrl()}>
                    <a
                      href={whatsappUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                    >
                      <MessageCircle class="size-3" />
                      Abrir WhatsApp
                    </a>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={summaryBullets().length > 0}>
            <div class="rounded-lg border border-zinc-200 bg-white p-2.5">
              <p class="font-bold text-zinc-800">Resumo do histórico:</p>
              <ul class="mt-1 list-disc space-y-0.5 pl-4 text-zinc-600">
                <For each={summaryBullets()}>{(b) => <li>{b}</li>}</For>
              </ul>
            </div>
          </Show>

          <Show when={occFindings().length > 0}>
            <div class="rounded-lg border border-zinc-200 bg-white p-2.5">
              <p class="font-bold text-zinc-800">Análise de ocorrências:</p>
              <ul class="mt-1 list-disc space-y-0.5 pl-4 text-zinc-600">
                <For each={occFindings()}>{(f) => <li>{f}</li>}</For>
              </ul>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
