const frontend = process.env.HEALTHCHECK_URL;
if (!frontend)
  throw new Error(
    "Configure HEALTHCHECK_URL com a origem pública do frontend.",
  );
const url = new URL(frontend);
if (!["http:", "https:"].includes(url.protocol))
  throw new Error("Use uma URL HTTP(S).");
const response = await fetch(new URL("/health.json", url), {
  signal: AbortSignal.timeout(10_000),
  redirect: "error",
});
if (!response.ok || (await response.json()).status !== "ok")
  throw new Error("Falha na verificação de saúde do frontend.");
if (process.env.API_HEALTHCHECK_URL) {
  const api = await fetch(process.env.API_HEALTHCHECK_URL, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!api.ok) throw new Error("Falha na verificação de saúde da API.");
}
console.info("Frontend e endpoints configurados disponíveis.");
