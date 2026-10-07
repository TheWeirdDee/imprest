import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  globalTimeout: 20 * 60_000, // a stalled run fails loudly instead of hanging (see FINAL_AUDIT, browser anomaly)
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "../proof/local/web-e2e-results.json" }]],
  use: { baseURL: "http://localhost:3000", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_IMPREST_ENV: "testnet", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
