import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    channel: process.env.PW_CHANNEL ?? "chrome", // uses the installed Chrome — no browser download
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `pnpm exec next dev --port ${port}`, port, reuseExistingServer: true, timeout: 120_000 },
});
