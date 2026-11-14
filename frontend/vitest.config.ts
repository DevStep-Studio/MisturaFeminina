import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: [
        "src/security/**/*.ts",
        "src/lib/api*.ts",
        "src/monitoring/sanitize.ts",
        "src/features/**/schemas/*.ts",
      ],
      reporter: ["text", "lcov"],
    },
  },
});
