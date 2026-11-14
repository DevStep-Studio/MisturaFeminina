import { spawnSync } from "node:child_process";
import { readdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
for (const key of [
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_RELEASE",
]) {
  if (!process.env[key])
    throw new Error(`Configure ${key} no ambiente privado do CI.`);
}
async function maps(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await maps(path)));
    else if (path.endsWith(".map")) result.push(path);
  }
  return result;
}
const files = await maps("dist");
if (!files.length)
  throw new Error("Gere o build com GENERATE_SOURCEMAPS=true antes do upload.");
try {
  const cli = resolve("node_modules/.bin/sentry-cli");
  for (const args of [
    ["sourcemaps", "inject", "dist"],
    ["sourcemaps", "upload", "--release", process.env.SENTRY_RELEASE, "dist"],
  ]) {
    const result = spawnSync(cli, args, { stdio: "inherit", env: process.env });
    if (result.error || result.status !== 0)
      throw new Error("Falha no upload privado dos source maps.");
  }
} finally {
  await Promise.all(files.map((file) => unlink(file)));
}
