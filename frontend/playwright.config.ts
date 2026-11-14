import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium" },
  webServer: {
    command:
      "npm exec vite -- build --outDir .playwright-build && npm exec vite -- preview --outDir .playwright-build --host 127.0.0.1 --port 3100 --strictPort",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      VITE_SITE_URL: "https://devstep.example",
      VITE_SITE_NAME: "DevStep Teste",
      VITE_SITE_INDEXABLE: "true",
      VITE_GTM_ID: "GTM-TEST123",
      VITE_ENABLE_ANALYTICS: "true",
      VITE_ENABLE_MONITORING: "false",
      VITE_ENABLE_MFA: "true",
      VITE_AUTH_URL: "http://127.0.0.1:3100",
      VITE_API_URL: "http://127.0.0.1:3100/api/v1",
      VITE_USE_REAL_API: "true",
    },
  },
});
