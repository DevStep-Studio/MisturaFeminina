import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Styled native select for short fixed lists with persistent label and inline error display.
 */
export function AdminSelect(props: {
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string | null;
  disabled?: boolean;
  class?: string;
}) {
  const selectId = `adm-select-${createUniqueId()}`;
  return (
    <div class={props.class}>
      <Show when={props.label}>
        <label
          for={selectId}
          class="mb-1 block text-xs font-semibold text-zinc-700"
        >
          {props.label}
        </label>
      </Show>
      <select
        id={selectId}
        aria-label={props.ariaLabel ?? props.label}
        disabled={props.disabled}
        value={props.value}
        aria-invalid={props.error ? "true" : undefined}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        class={`h-9 w-full rounded-[8px] border bg-white px-2.5 text-xs text-zinc-900 transition-colors focus:border-[#93509e] focus:outline-none disabled:bg-zinc-100 ${
          props.error ? "border-red-500" : "border-zinc-300"
        }`}
      >
        <For each={props.options}>
          {(opt) => <option value={opt.value}>{opt.label}</option>}
        </For>
      </select>
      <Show when={props.error}>
        <p role="alert" class="mt-1 text-[11px] font-medium text-red-700">
          {props.error}
        </p>
      </Show>
    </div>
  );
}

/**
 * Keyboard-searchable single-select combobox with viewport-aware dropdown flipping.
 */
export function AdminCombobox(props: {
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  allowClear?: boolean;
  emptyText?: string;
  error?: string | null;
  class?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [dropUp, setDropUp] = createSignal(false);
  const listboxId = `adm-cb-list-${createUniqueId()}`;
  const triggerId = `adm-cb-btn-${createUniqueId()}`;
  let rootRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const selectedOption = createMemo(
    () => props.options.find((o) => o.value === props.value) ?? null,
  );

  const normalizeSearch = (val: string) =>
    val
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filteredOptions = createMemo(() => {
    const q = normalizeSearch(query().trim());
    if (!q) return props.options;
    return props.options.filter(
      (o) =>
        normalizeSearch(o.label).includes(q) ||
        (o.hint ? normalizeSearch(o.hint).includes(q) : false),
    );
  });

  function updatePlacement() {
    if (!rootRef) return;
    const rect = rootRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 240 && rect.top > 240);
  }

  function openMenu() {
    updatePlacement();
    setOpen(true);
    setQuery("");
    const currentIdx = filteredOptions().findIndex(
      (o) => o.value === props.value,
    );
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    requestAnimationFrame(() => searchInputRef?.focus());
  }

  function closeMenu(returnFocus = false) {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() =>
        document.getElementById(triggerId)?.focus(),
      );
    }
  }

  function selectOption(val: string) {
    props.onChange(val);
    closeMenu(true);
  }

  createEffect(() => {
    if (!open()) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        closeMenu(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    onCleanup(() => document.removeEventListener("mousedown", onOutside));
  });

  return (
    <div ref={rootRef} class={`relative ${props.class ?? ""}`}>
      <label
        for={triggerId}
        class="mb-1 block text-xs font-semibold text-zinc-700"
      >
        {props.label}
      </label>
      <div class="relative flex items-center">
        <button
          id={triggerId}
          type="button"
          role="combobox"
          aria-expanded={open()}
          aria-controls={listboxId}
          aria-invalid={props.error ? "true" : undefined}
          onClick={() => (open() ? closeMenu(false) : openMenu())}
          onKeyDown={(e) => {
            if (
              e.key === "ArrowDown" ||
              e.key === "ArrowUp" ||
              e.key === "Enter" ||
              e.key === " "
            ) {
              e.preventDefault();
              openMenu();
            }
          }}
          class={`flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border bg-white px-3 text-left text-xs transition-colors ${
            props.error
              ? "border-red-500 text-red-900"
              : "border-zinc-300 text-zinc-900 hover:border-zinc-400"
          } ${props.allowClear !== false && props.value ? "pr-12" : "pr-8"}`}
        >
          <span
            class={`truncate ${
              selectedOption() ? "font-medium text-zinc-900" : "text-zinc-500"
            }`}
          >
            {selectedOption()?.label ??
              props.placeholder ??
              "Selecionar opção..."}
          </span>
        </button>

        <Show when={props.allowClear !== false && props.value}>
          <button
            type="button"
            aria-label={`Limpar ${props.label}`}
            onClick={(e) => {
              e.stopPropagation();
              props.onChange("");
            }}
            class="absolute right-7 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </Show>
        <ChevronDown class="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-zinc-500" />
      </div>

      <Show when={open()}>
        <div
          style={{ "box-shadow": "var(--adm-shadow-popover)" }}
          class={`absolute left-0 right-0 z-[70] rounded-[8px] border border-zinc-200 bg-white ${
            dropUp() ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div class="flex items-center gap-1.5 border-b border-zinc-100 px-2.5 py-2">
            <Search class="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={query()}
              placeholder={props.searchPlaceholder ?? "Buscar na lista..."}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                const list = filteredOptions();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(list.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const hit = list[activeIndex()];
                  if (hit) selectOption(hit.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  closeMenu(true);
                }
              }}
              class="w-full bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            class="max-h-52 overflow-y-auto py-1 text-xs"
          >
            <Show
              when={filteredOptions().length > 0}
              fallback={
                <li class="px-3 py-3 text-center text-zinc-500">
                  {props.emptyText ?? "Nenhum item encontrado."}
                </li>
              }
            >
              <For each={filteredOptions()}>
                {(opt, idx) => {
                  const isSelected = () => opt.value === props.value;
                  const isActive = () => idx() === activeIndex();
                  return (
                    <li role="option" aria-selected={isSelected()}>
                      <button
                        type="button"
                        onClick={() => selectOption(opt.value)}
                        onMouseEnter={() => setActiveIndex(idx())}
                        class={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                          isActive()
                            ? "bg-[#f5ebf7] text-[#62298d]"
                            : isSelected()
                              ? "font-semibold text-[#62298d]"
                              : "text-zinc-800 hover:bg-zinc-50"
                        }`}
                      >
                        <span class="min-w-0 truncate">
                          {opt.label}
                          <Show when={opt.hint}>
                            <span class="ml-1.5 text-[11px] text-zinc-400">
                              {opt.hint}
                            </span>
                          </Show>
                        </span>
                        <Show when={isSelected()}>
                          <Check class="h-3.5 w-3.5 shrink-0 text-[#93509e]" />
                        </Show>
                      </button>
                    </li>
                  );
                }}
              </For>
            </Show>
          </ul>
        </div>
      </Show>

      <Show when={props.error}>
        <p role="alert" class="mt-1 text-[11px] font-medium text-red-700">
          {props.error}
        </p>
      </Show>
    </div>
  );
}

/**
 * Keyboard-driven searchable multi-select combobox with compact selected badges
 * (prevents unbounded tag walls when dozens of categories exist).
 */
export function AdminMultiCombobox(props: {
  label: string;
  placeholder?: string;
  selectedValues: string[];
  options: ComboboxOption[];
  onToggleValue: (value: string) => void;
  onClearAll?: () => void;
  class?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [dropUp, setDropUp] = createSignal(false);
  const triggerId = `adm-mcb-btn-${createUniqueId()}`;
  const listboxId = `adm-mcb-list-${createUniqueId()}`;
  let rootRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const selectedOptions = createMemo(() =>
    props.options.filter((o) => props.selectedValues.includes(o.value)),
  );

  const normalizeSearch = (val: string) =>
    val
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filteredOptions = createMemo(() => {
    const q = normalizeSearch(query().trim());
    if (!q) return props.options;
    return props.options.filter(
      (o) =>
        normalizeSearch(o.label).includes(q) ||
        (o.hint ? normalizeSearch(o.hint).includes(q) : false),
    );
  });

  function toggleMenu() {
    if (open()) {
      setOpen(false);
      return;
    }
    if (rootRef) {
      const rect = rootRef.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 250 && rect.top > 250);
    }
    setOpen(true);
    setActiveIndex(0);
    requestAnimationFrame(() => searchInputRef?.focus());
  }

  createEffect(() => {
    if (!open()) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    onCleanup(() => document.removeEventListener("mousedown", onOutside));
  });

  return (
    <div ref={rootRef} class={`relative space-y-2 ${props.class ?? ""}`}>
      <div class="flex items-center justify-between gap-2">
        <label
          for={triggerId}
          class="text-xs font-semibold text-zinc-700"
        >
          {props.label}{" "}
          <span class="font-normal text-zinc-500">
            ({props.selectedValues.length} selecionada(s))
          </span>
        </label>
        <Show when={props.selectedValues.length > 0 && props.onClearAll}>
          <button
            type="button"
            onClick={() => props.onClearAll?.()}
            class="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
          >
            Limpar seleção
          </button>
        </Show>
      </div>

      <button
        id={triggerId}
        type="button"
        role="combobox"
        aria-expanded={open()}
        aria-controls={listboxId}
        onClick={() => toggleMenu()}
        class="flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-zinc-300 bg-white px-3 text-left text-xs text-zinc-800 hover:border-zinc-400"
      >
        <span class="truncate">
          {selectedOptions().length === 0
            ? (props.placeholder ?? "Pesquisar e vincular opções...")
            : selectedOptions().length <= 3
              ? selectedOptions()
                  .map((o) => o.label)
                  .join(", ")
              : `${selectedOptions()
                  .slice(0, 2)
                  .map((o) => o.label)
                  .join(", ")} +${selectedOptions().length - 2}`}
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>

      <Show when={open()}>
        <div
          style={{ "box-shadow": "var(--adm-shadow-popover)" }}
          class={`absolute left-0 right-0 z-[70] rounded-[8px] border border-zinc-200 bg-white ${
            dropUp() ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div class="flex items-center gap-1.5 border-b border-zinc-100 px-2.5 py-2">
            <Search class="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={query()}
              placeholder="Filtrar por nome..."
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                const list = filteredOptions();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(list.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const hit = list[activeIndex()];
                  if (hit) props.onToggleValue(hit.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  requestAnimationFrame(() =>
                    document.getElementById(triggerId)?.focus(),
                  );
                }
              }}
              class="w-full bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            class="max-h-56 overflow-y-auto py-1 text-xs"
          >
            <Show
              when={filteredOptions().length > 0}
              fallback={
                <li class="px-3 py-3 text-center text-zinc-500">
                  Nenhuma categoria encontrada.
                </li>
              }
            >
              <For each={filteredOptions()}>
                {(opt, idx) => {
                  const checked = () =>
                    props.selectedValues.includes(opt.value);
                  const isActive = () => idx() === activeIndex();
                  return (
                    <li role="option" aria-selected={checked()}>
                      <button
                        type="button"
                        onClick={() => props.onToggleValue(opt.value)}
                        onMouseEnter={() => setActiveIndex(idx())}
                        class={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                          isActive() ? "bg-[#f5ebf7] text-[#62298d]" : "hover:bg-zinc-50"
                        }`}
                      >
                        <span class="truncate font-medium text-zinc-800">
                          {opt.label}
                        </span>
                        <span
                          class={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked()
                              ? "border-[#93509e] bg-[#93509e] text-white"
                              : "border-zinc-300 bg-white"
                          }`}
                        >
                          <Show when={checked()}>
                            <Check class="h-3 w-3" />
                          </Show>
                        </span>
                      </button>
                    </li>
                  );
                }}
              </For>
            </Show>
          </ul>
        </div>
      </Show>

      <Show when={selectedOptions().length > 0}>
        <div class="flex flex-wrap gap-1.5">
          <For each={selectedOptions().slice(0, 6)}>
            {(cat) => (
              <button
                type="button"
                onClick={() => props.onToggleValue(cat.value)}
                class="inline-flex items-center gap-1 rounded-[6px] border border-[#e4c6ea] bg-[#f5ebf7] px-2 py-0.5 text-[11px] font-medium text-[#62298d] hover:bg-[#ead8f0]"
              >
                <span class="max-w-[140px] truncate">{cat.label}</span>
                <X class="h-3 w-3 shrink-0" />
              </button>
            )}
          </For>
          <Show when={selectedOptions().length > 6}>
            <button
              type="button"
              onClick={() => toggleMenu()}
              class="rounded-[6px] border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
            >
              +{selectedOptions().length - 6} mais
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
