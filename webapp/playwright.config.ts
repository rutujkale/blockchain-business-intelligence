import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Minimal QA harness: 7 pages x 3 viewports, plus the filter / drawer /
 * export interactions that the static HTML cannot prove.
 *
 * `next start` needs a production build, so the harness builds first. The
 * build uses `--webpack`: the default Turbopack builder resolves
 * `next/font/google` through `@vercel/turbopack-next`, which is not in
 * package-lock.json, so it cannot resolve outside a Vercel build. Vercel
 * itself builds this app with Turbopack and is unaffected.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `npx.cmd next build --webpack && npx.cmd next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    { name: "375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
