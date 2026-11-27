import ExternalLink from "lucide-solid/icons/external-link";
import ImagePlus from "lucide-solid/icons/image-plus";
import Loader2 from "lucide-solid/icons/loader-circle";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Trash2 from "lucide-solid/icons/trash";
import { type JSX, Show, createSignal, createUniqueId, splitProps } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { assetUrl } from "../../../lib/format";

/**
 * Field wrapper keeping visible label above input and validation alert right below.
 */
export function AdminField(props: {
  label: string;
  forId?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <div class={props.class}>
      <label
        for={props.forId}
        class="mb-1 block text-xs font-semibold text-zinc-700"
      >
        {props.label}
        <Show when={props.required}>
          <span class="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        </Show>
      </label>
      {props.children}
      <Show when={props.error}>
        <p role="alert" class="mt-1 text-[11px] font-medium text-red-700">
          {props.error}
        </p>
      </Show>
      <Show when={props.hint && !props.error}>
        <p class="mt-1 text-[11px] text-zinc-500">{props.hint}</p>
      </Show>
    </div>
  );
}

export interface AdminInputProps
  extends JSX.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  mono?: boolean;
}

export function AdminInput(props: AdminInputProps) {
  const [local, rest] = splitProps(props, ["hasError", "mono", "class"]);
  return (
    <input
      {...rest}
      aria-invalid={local.hasError ? "true" : undefined}
      class={`h-9 w-full rounded-[8px] border bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500 ${
        local.mono ? "font-mono" : ""
      } ${local.hasError ? "border-red-500" : "border-zinc-300"} ${
        local.class ?? ""
      }`}
    />
  );
}

export interface AdminTextareaProps
  extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export function AdminTextarea(props: AdminTextareaProps) {
  const [local, rest] = splitProps(props, ["hasError", "class"]);
  return (
    <textarea
      {...rest}
      aria-invalid={local.hasError ? "true" : undefined}
      class={`w-full rounded-[8px] border bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100 ${
        local.hasError ? "border-red-500" : "border-zinc-300"
      } ${local.class ?? ""}`}
    />
  );
}

/**
 * Portuguese image upload control replacing browser-native "Choose File / No file chosen".
 * Supports instant upload via /admin/media/upload or custom handler, thumbnail preview,
 * filename readout, Replace and Remove actions, and inline validation feedback.
 */
export function AdminImageUpload(props: {
  label: string;
  value: string;
  onChange: (nextPath: string) => void;
  folder?: string;
  hint?: string;
  error?: string | null;
  accept?: string;
  altText?: string;
  previewShape?: "square" | "wide";
  onUploadFile?: (file: File) => Promise<string>;
}) {
  const inputId = `adm-img-up-${createUniqueId()}`;
  const [uploading, setUploading] = createSignal(false);
  const [fileName, setFileName] = createSignal("");
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  async function processFile(file: File) {
    setUploadError(null);

    // Validate allowed image types
    const allowedExts = [".png", ".jpg", ".jpeg", ".webp", ".avif"];
    const allowedMimes = ["image/png", "image/jpeg", "image/webp", "image/avif"];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = allowedExts.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = allowedMimes.includes(file.type);

    if (!hasValidExt && !hasValidMime) {
      setUploadError("Formato não suportado. Envie apenas imagens PNG, JPG, WebP ou AVIF.");
      if (fileInputRef) fileInputRef.value = "";
      return;
    }

    // Validate size (max 5 MB)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError("O arquivo excede o limite máximo de 5 MB.");
      if (fileInputRef) fileInputRef.value = "";
      return;
    }

    setUploading(true);
    setFileName(file.name);
    try {
      if (props.onUploadFile) {
        const uploadedPath = await props.onUploadFile(file);
        props.onChange(uploadedPath);
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", props.folder ?? "products");
        const res = await api<{ data: { path: string } }>(
          "/admin/media/upload",
          { method: "POST", body: fd },
        );
        props.onChange(res.data.path);
      }
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.message
          : "Falha ao enviar a imagem. Tente outro arquivo.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef) fileInputRef.value = "";
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading()) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading()) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) void processFile(f);
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const f = items[i].getAsFile();
        if (f) {
          e.preventDefault();
          void processFile(f);
          break;
        }
      }
    }
  }

  const displayName = () => {
    if (fileName()) return fileName();
    if (!props.value) return "";
    const parts = props.value.split("/");
    return parts[parts.length - 1] || props.value;
  };

  const hasValue = () => Boolean((props.value || "").trim());

  return (
    <div class="space-y-1.5" onPaste={handlePaste}>
      <div class="flex items-center justify-between">
        <label
          for={inputId}
          class="block text-xs font-semibold text-zinc-700 cursor-pointer"
        >
          {props.label}
        </label>
        <Show when={hasValue()}>
          <span class="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-[4px]">
            Foto vinculada
          </span>
        </Show>
      </div>

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept={props.accept ?? ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"}
        class="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void processFile(f);
        }}
        onClick={(e) => {
          e.currentTarget.value = "";
        }}
      />

      <Show
        when={hasValue()}
        fallback={
          <label
            for={inputId}
            tabIndex={0}
            role="button"
            aria-label={`Selecionar imagem para ${props.label}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            class={`group relative flex cursor-pointer flex-wrap items-center gap-3 rounded-[10px] border-2 border-dashed p-3 transition-colors select-none ${
              isDragging()
                ? "border-[#93509e] bg-[#fbf5fc]"
                : "border-zinc-300 bg-zinc-50/70 hover:border-[#93509e] hover:bg-white"
            }`}
          >
            <div class="pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-xs group-hover:border-[#93509e] group-hover:text-[#93509e]">
              <Show
                when={uploading()}
                fallback={<ImagePlus class="h-3.5 w-3.5 text-[#93509e]" />}
              >
                <Loader2 class="h-3.5 w-3.5 animate-spin text-[#93509e]" />
              </Show>
              <span>{uploading() ? "Enviando imagem…" : "Selecionar imagem"}</span>
            </div>
            <div class="pointer-events-none flex flex-col text-xs">
              <span class="font-medium text-zinc-700">
                {props.hint ?? "PNG, JPG ou WebP (máx. 5 MB)"}
              </span>
              <span class="text-[11px] text-zinc-600">
                Clique aqui ou arraste o arquivo para esta área
              </span>
            </div>
          </label>
        }
      >
        <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-zinc-200 bg-white p-2.5 shadow-xs">
          <img
            src={assetUrl(props.value)}
            alt={props.altText || props.label}
            class={`shrink-0 rounded-[6px] border border-zinc-200 bg-zinc-50 object-contain ${
              props.previewShape === "wide" ? "h-12 w-24 p-1" : "h-12 w-12"
            }`}
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold text-zinc-900">
              {displayName()}
            </p>
            <p class="truncate text-[11px] font-mono text-zinc-600">{props.value}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <label
              for={inputId}
              class="adm-btn inline-flex h-8 cursor-pointer items-center gap-1 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 select-none"
            >
              <Show when={uploading()} fallback={<RefreshCw class="h-3 w-3" />}>
                <Loader2 class="h-3 w-3 animate-spin text-[#93509e]" />
              </Show>
              {uploading() ? "Enviando…" : "Substituir"}
            </label>
            <a
              href={assetUrl(props.value)}
              target="_blank"
              rel="noopener noreferrer"
              class="adm-btn inline-flex h-8 items-center gap-1 rounded-[8px] border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              title="Abrir imagem original em nova aba"
            >
              <ExternalLink class="h-3 w-3" />
              Visualizar
            </a>
            <button
              type="button"
              onClick={() => {
                setFileName("");
                props.onChange("");
                if (fileInputRef) fileInputRef.value = "";
              }}
              aria-label={`Remover imagem de ${props.label}`}
              class="adm-btn inline-flex h-8 items-center gap-1 rounded-[8px] border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 class="h-3 w-3" />
              Remover
            </button>
          </div>
        </div>
      </Show>

      <Show when={props.error || uploadError()}>
        <p role="alert" class="text-[11px] font-medium text-red-700">
          {props.error || uploadError()}
        </p>
      </Show>
    </div>
  );
}
