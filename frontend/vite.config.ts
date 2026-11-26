import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

import { seoAssets } from "./build/seo-assets.ts";

export default defineConfig(({ mode, command }) => ({
  optimizeDeps: {
    include: ["lucide-solid"],
  },
  build: {
    manifest: true,
    sourcemap: process.env.GENERATE_SOURCEMAPS === "true" ? "hidden" : false,
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    tanstackRouter({ target: "solid", autoCodeSplitting: true }),
    solid(),
    tailwindcss(),
    seoAssets(loadEnv(mode, process.cwd(), "VITE_"), command === "serve"),
  ],
}));
