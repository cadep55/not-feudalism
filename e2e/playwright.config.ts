import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

// Locally: the Vite dev server from `pnpm dev`. In CI: `vite preview` of the production build.
const baseURL =
  process.env.E2E_BASE_URL ?? (CI ? "http://localhost:4173" : "http://localhost:5173");
const serverURL = process.env.E2E_SERVER_URL ?? "http://localhost:2567";

export default defineConfig({
  testDir: "./tests",
  // One browser at a time: several cold browsers loading from Vite's dev server at once
  // stall page loads (seen on Windows). Revisit with the production build once the suite grows.
  workers: 1,
  forbidOnly: CI,
  // Flaky tests are bugs (docs/CONVENTIONS.md §4): no automatic retries.
  retries: 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: CI
    ? [
        {
          command: "pnpm --filter @nf/server start",
          url: `${serverURL}/readyz`,
          cwd: "..",
          reuseExistingServer: false,
        },
        {
          command: "pnpm --filter @nf/client preview --port 4173 --strictPort",
          url: baseURL,
          cwd: "..",
          reuseExistingServer: false,
        },
      ]
    : {
        // Reuses a running `pnpm dev`, or starts one.
        command: "pnpm dev",
        url: baseURL,
        cwd: "..",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

export { serverURL };
