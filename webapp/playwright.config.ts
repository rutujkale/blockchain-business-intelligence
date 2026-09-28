import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Minimal QA harness: 7 pages x 3 viewports, plus the filter / drawer /
 * export interactions that the static HTML cannot prove.
 *
 * `next start` needs a production build, so the harness builds first, into
 * its own `distDir` (see next.config.ts). The build uses `--webpack`, which
 * is the builder that resolves `next/font/google` in this repo. Sharing the
 * default `.next` with `npm run build` makes the two contaminate each other:
 * Turbopack then fails on the webpack artifacts with a resolution error for a
 * `@vercel/turbopack-next` package that does not exist on npm.
 */
const DIST = ".next-qa";

/**
 * Set QA_BASE_URL to run the same assertions against a deployed URL instead of
 * a local build. Most of this suite is client-side routing, so a deployed
 * page's assertions cannot be checked from its static HTML at all; running the
 * suite against the deployment is the only way to see them.
 */
const EXTERNAL = process.env.QA_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: EXTERNAL ?? `http://127.0.0.1:${PORT}`,
  },
  // No local server when pointed at a deployment.
  ...(EXTERNAL
    ? {}
    : {
        webServer: {
          command: `npx next build --webpack && npx next start --port ${PORT}`,
          env: { NEXT_DIST_DIR: DIST },
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: true,
          timeout: 300_000,
        },
      }),
  projects: [
    { name: "375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
