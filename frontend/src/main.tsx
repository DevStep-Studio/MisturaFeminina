const root = document.getElementById("root");
if (root) {
  const startupObserver = new MutationObserver(() => {
    if (root.childElementCount || root.textContent?.trim()) {
      document.getElementById("startup")?.remove();
      startupObserver.disconnect();
    }
  });
  startupObserver.observe(root, { childList: true, subtree: true });
}

void import("./app/bootstrap")
  .then((module) => module.bootstrap())
  .catch(() => {
    const root = document.getElementById("root");
    if (root) {
      root.className = "grid min-h-svh place-items-center bg-canvas px-6 py-10";
      root.innerHTML = `<section role="alert" class="w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-xl shadow-brand-700/5">
        <div class="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger" aria-hidden="true"><svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/></svg></div>
        <h1 class="m-0 text-2xl font-semibold tracking-tight text-ink">Não foi possível iniciar a aplicação</h1>
        <p class="mt-3 text-sm leading-7 text-muted">Atualize a página para tentar novamente.</p>
        <button type="button" class="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">Atualizar página</button>
      </section>`;
      root
        .querySelector("button")
        ?.addEventListener("click", () => window.location.reload());
    }
  });
