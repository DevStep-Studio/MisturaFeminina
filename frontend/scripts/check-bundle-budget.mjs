import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const files = new Set();
function visit(key) {
  const chunk = manifest[key];
  if (!chunk || files.has(chunk.file)) return;
  files.add(chunk.file);
  for (const css of chunk.css || []) files.add(css);
  for (const dependency of chunk.imports || []) visit(dependency);
}
for (const [key, chunk] of Object.entries(manifest))
  if (chunk.isEntry || key === "src/app/bootstrap.tsx") visit(key);
let js = 0,
  css = 0;
for (const file of files) {
  const size = gzipSync(await readFile(join("dist", file))).length;
  if (file.endsWith(".js")) js += size;
  if (file.endsWith(".css")) css += size;
}
if (js > 150_000 || css > 40_000)
  throw new Error(
    `Orçamento inicial excedido: JS ${js} bytes, CSS ${css} bytes (gzip).`,
  );
for (const entry of await readdir("dist/assets")) {
  if (
    entry.endsWith(".js") &&
    gzipSync(await readFile(join("dist/assets", entry))).length > 200_000
  )
    throw new Error(`Chunk acima de 200 kB gzip: ${entry}`);
}
console.info(
  `Bundle dentro do orçamento: JS inicial ${js} bytes; CSS ${css} bytes (gzip).`,
);
