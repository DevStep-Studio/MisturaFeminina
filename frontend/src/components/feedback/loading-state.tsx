export function LoadingState(props: { message?: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-label={props.message || "Carregando..."}
      class={
        props.fullScreen
          ? "fixed inset-0 z-[9999] flex min-h-dvh w-full items-center justify-center bg-white/95 p-6"
          : "flex min-h-[50vh] w-full flex-1 items-center justify-center p-6"
      }
    >
      <div class="flex items-center justify-center">
        <img
          src="/logo-mf.png"
          alt="Carregando"
          class="mf-logo-spin-3d h-14 w-auto max-w-[68px] select-none object-contain sm:h-16 sm:max-w-[76px]"
        />
      </div>
      <span class="sr-only">{props.message || "Carregando..."}</span>
    </div>
  );
}
