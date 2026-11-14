export function LoadingState(props: { message?: string }) {
  return (
    <div
      role="status"
      aria-label={props.message || "Carregando..."}
      class="flex min-h-[50vh] w-full flex-1 items-center justify-center p-6"
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
