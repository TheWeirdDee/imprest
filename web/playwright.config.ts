import { defineConfig, devices } from "@playwright/test";

// PW_PORT lets the suite run against its own fresh server while a dev server holds 3000.
const PORT = process.env.PW_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  globalTimeout: 20 * 60_000, // a stalled run fails loudly instead of hanging (see FINAL_AUDIT, browser anomaly)
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "../proof/local/web-e2e-results.json" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_IMPREST_ENV: "testnet", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
