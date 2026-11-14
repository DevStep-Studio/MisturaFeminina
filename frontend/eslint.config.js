import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid";
import prettier from "eslint-config-prettier";
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".playwright-build/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      "src/routeTree.gen.ts",
      ".tanstack/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  ...tseslint.configs.recommended,
  { files: ["src/**/*.tsx"], ...solid.configs["flat/typescript"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
