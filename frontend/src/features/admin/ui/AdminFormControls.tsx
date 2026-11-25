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
  let fileInputRef: HTMLInputElement | undefined;

  async function handleFileChange(file: File) {
    setUploadError(null);
    setUploading(true);
    setFileName(file.name);
    try {
      if (props.onUploadFile) {
        const uploadedPath = await props.onUploadFile(file);
        props.onChange(uploadedPath);
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", props.folder ?? "catalog");
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

  const displayName = () => {
    if (fileName()) return fileName();
    if (!props.value) return "";
    const parts = props.value.split("/");
    return parts[parts.length - 1] || props.value;
  };

  return (
    <div class="space-y-1.5">
      <label
        for={inputId}
        class="block text-xs font-semibold text-zinc-700"
      >
        {props.label}
      </label>

      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept={props.accept ?? "image/*"}
        class="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void handleFileChange(f);
        }}
      />

      <Show
        when={props.value.trim()}
        fallback={
          <div class="flex flex-wrap items-center gap-2.5 rounded-[8px] border border-dashed border-zinc-300 bg-zinc-50/70 px-3 py-2.5">
            <button
              type="button"
              disabled={uploading()}
              onClick={() => fileInputRef?.click()}
              class="adm-btn inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-55"
            >
              <Show
                when={uploading()}
                fallback={<ImagePlus class="h-3.5 w-3.5 text-[#93509e]" />}
              >
                <Loader2 class="h-3.5 w-3.5 animate-spin text-[#93509e]" />
              </Show>
              {uploading() ? "Enviando imagem…" : "Selecionar imagem"}
            </button>
            <span class="text-xs text-zinc-500">
              {props.hint ?? "PNG, JPG ou WebP"}
            </span>
          </div>
        }
      >
        <div class="flex flex-wrap items-center gap-3 rounded-[8px] border border-zinc-200 bg-white p-2.5">
          <img
            src={assetUrl(props.value)}
            alt={props.altText || props.label}
            class={`shrink-0 rounded-[6px] border border-zinc-200 bg-zinc-50 object-contain ${
              props.previewShape === "wide" ? "h-10 w-20 p-1" : "h-11 w-11"
            }`}
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-zinc-900">
              {displayName()}
            </p>
            <p class="truncate text-[11px] text-zinc-500">{props.value}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={uploading()}
              onClick={() => fileInputRef?.click()}
              class="adm-btn inline-flex h-8 items-center gap-1 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <RefreshCw class="h-3 w-3" />
              Substituir
            </button>
            <button
              type="button"
              onClick={() => {
                setFileName("");
                props.onChange("");
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
