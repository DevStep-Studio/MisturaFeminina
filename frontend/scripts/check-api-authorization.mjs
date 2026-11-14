const base = process.env.LIVE_API_URL;
if (!base)
  throw new Error("Configure LIVE_API_URL para verificar o backend real.");
for (const path of ["me"]) {
  const response = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (![401, 403].includes(response.status))
    throw new Error(
      `Endpoint ${path} não bloqueou acesso anônimo (HTTP ${response.status}).`,
    );
}
console.info("Endpoints privados rejeitam acessos anônimos.");
