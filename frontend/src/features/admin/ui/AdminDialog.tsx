import X from "lucide-solid/icons/x";
import {
  type JSX,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
} from "solid-js";
import { AdminButton } from "./AdminButton";

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

function useAccessibleDialog(options: {
  open: () => boolean;
  isDirty?: () => boolean;
  onClose: () => void;
}) {
  let panelRef: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  const [confirmDiscardOpen, setConfirmDiscardOpen] = createSignal(false);

  function attemptClose() {
    if (options.isDirty?.()) {
      setConfirmDiscardOpen(true);
      return;
    }
    setConfirmDiscardOpen(false);
    options.onClose();
  }

  function confirmDiscard() {
    setConfirmDiscardOpen(false);
    options.onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!options.open()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (confirmDiscardOpen()) {
        setConfirmDiscardOpen(false);
      } else {
        attemptClose();
      }
      return;
    }

    if (e.key === "Tab" && panelRef) {
      const focusables = getFocusableElements(panelRef);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !panelRef.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || active === last || !panelRef.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  createEffect(() => {
    const isOpen = options.open();
    if (!isOpen) {
      setConfirmDiscardOpen(false);
      return;
    }

    previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKeyDown, true);

    const rafId = requestAnimationFrame(() => {
      if (!panelRef) return;
      const autoTarget = panelRef.querySelector<HTMLElement>("[data-autofocus]");
      if (autoTarget) {
        autoTarget.focus();
        return;
      }
      const focusables = getFocusableElements(panelRef);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panelRef.focus();
      }
    });

    onCleanup(() => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        requestAnimationFrame(() => {
          previouslyFocused?.focus();
        });
      }
    });
  });

  return {
    setPanelRef: (el: HTMLDivElement) => {
      panelRef = el;
    },
    confirmDiscardOpen,
    setConfirmDiscardOpen,
    attemptClose,
    confirmDiscard,
  };
}

/**
 * Compact modal dialog with focus trapping, Escape/unsaved guard, and sticky mobile-safe footer.
 */
export function AdminModal(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  closeLabel?: string;
  isDirty?: boolean;
  onClose: () => void;
  footer?: JSX.Element;
  children: JSX.Element;
}) {
  const titleId = `adm-modal-title-${createUniqueId()}`;
  const dialog = useAccessibleDialog({
    open: () => props.open,
    isDirty: () => Boolean(props.isDirty),
    onClose: () => props.onClose(),
  });

  return (
    <Show when={props.open}>
      <div
        class="adm-overlay-backdrop fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.attemptClose();
        }}
      >
        <div
          ref={dialog.setPanelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          class={`adm-modal-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[12px] border border-zinc-200 bg-white sm:rounded-[12px] ${props.maxWidthClass ?? "max-w-lg"}`}
        >
          <header class="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
            <div class="min-w-0">
              <h2
                id={titleId}
                class="truncate text-sm font-bold text-zinc-900 sm:text-base"
              >
                {props.title}
              </h2>
              <Show when={props.subtitle}>
                <p class="mt-0.5 truncate text-xs text-zinc-500">
                  {props.subtitle}
                </p>
              </Show>
            </div>
            <AdminButton
              variant="ghost"
              size="icon"
              aria-label={props.closeLabel ?? `Fechar ${props.title}`}
              onClick={() => dialog.attemptClose()}
            >
              <X class="h-4 w-4" />
            </AdminButton>
          </header>

          <Show when={dialog.confirmDiscardOpen()}>
            <div
              role="alert"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-950"
            >
              <span class="font-medium">
                Existem alterações não salvas. Descartar e fechar?
              </span>
              <div class="flex items-center gap-2">
                <AdminButton
                  size="sm"
                  variant="secondary"
                  onClick={() => dialog.setConfirmDiscardOpen(false)}
                >
                  Continuar editando
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="danger"
                  onClick={() => dialog.confirmDiscard()}
                >
                  Descartar
                </AdminButton>
              </div>
            </div>
          </Show>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
            {props.children}
          </div>

          <Show when={props.footer}>
            <footer class="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {props.footer}
            </footer>
          </Show>
        </div>
      </div>
    </Show>
  );
}

/**
 * Desktop right slide-over panel / mobile full-screen editor with focus trap and unsaved guard.
 */
export function AdminSideDrawer(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  widthClass?: string;
  closeLabel?: string;
  isDirty?: boolean;
  onClose: () => void;
  footer?: JSX.Element;
  children: JSX.Element;
}) {
  const titleId = `adm-drawer-title-${createUniqueId()}`;
  const dialog = useAccessibleDialog({
    open: () => props.open,
    isDirty: () => Boolean(props.isDirty),
    onClose: () => props.onClose(),
  });

  return (
    <Show when={props.open}>
      <div
        class="adm-overlay-backdrop fixed inset-0 z-50 flex justify-end bg-zinc-950/45"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.attemptClose();
        }}
      >
        <div
          ref={dialog.setPanelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          class={`adm-drawer-right flex h-[100dvh] w-full flex-col bg-white sm:border-l sm:border-zinc-200 ${props.widthClass ?? "sm:max-w-lg"}`}
        >
          <header class="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div class="min-w-0">
              <h2
                id={titleId}
                class="truncate text-base font-bold text-zinc-900"
              >
                {props.title}
              </h2>
              <Show when={props.subtitle}>
                <p class="mt-0.5 truncate text-xs text-zinc-500">
                  {props.subtitle}
                </p>
              </Show>
            </div>
            <AdminButton
              variant="ghost"
              size="icon"
              aria-label={props.closeLabel ?? `Fechar ${props.title}`}
              onClick={() => dialog.attemptClose()}
            >
              <X class="h-4 w-4" />
            </AdminButton>
          </header>

          <Show when={dialog.confirmDiscardOpen()}>
            <div
              role="alert"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-950"
            >
              <span class="font-medium">
                Há alterações não salvas. Deseja descartar?
              </span>
              <div class="flex items-center gap-2">
                <AdminButton
                  size="sm"
                  variant="secondary"
                  onClick={() => dialog.setConfirmDiscardOpen(false)}
                >
                  Continuar editando
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="danger"
                  onClick={() => dialog.confirmDiscard()}
                >
                  Descartar
                </AdminButton>
              </div>
            </div>
          </Show>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
            {props.children}
          </div>

          <Show when={props.footer}>
            <footer class="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {props.footer}
            </footer>
          </Show>
        </div>
      </div>
    </Show>
  );
}
