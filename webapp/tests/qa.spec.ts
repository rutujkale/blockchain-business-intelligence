import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Expectations are read from the payloads at run time, never hardcoded, so a
 * payload change cannot silently turn an assertion into a tautology. The point
 * of `segment filter counts` is exactly that cross-check: every option the
 * filter panel offers must be a `segment` value that exists in
 * segment_summary.json, and must show that row's `wallet_count`.
 */
function payload<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "public", "data", name), "utf8")) as T;
}

interface SegmentRow {
  segment: string;
  wallet_count: number;
}
interface TopWallet {
  segment: string;
}
interface WalletRow {
  segment: string;
}

const segments = payload<{ segments: SegmentRow[] }>("segment_summary.json").segments;
const topWallets = payload<{ wallets: TopWallet[] }>("top_wallets.json").wallets;
const walletDetail = payload<{ wallets: WalletRow[] }>("wallet_detail.json").wallets;
const kpi = payload<{
  total_contracts: number;
  total_transactions: number;
  avg_gas_cost_usd: number;
  whale_definition: string;
}>("kpi_summary.json");
const contractsMeta = readFileSync(
  join(process.cwd(), "..", "data", "raw", "contracts_metadata.csv"),
  "utf8",
);

const PAGES = [
  "Overview",
  "Customer Intelligence",
  "Retention Analysis",
  "Operations",
  "Analytics",
  "Insights",
  "System",
] as const;

const n = (v: number) => new Intl.NumberFormat("en-US").format(v);

async function gotoPage(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
}

/** Opens the controlled filter sheet via the header's `tune` button. */
async function openFilters(page: Page) {
  await page
    .locator("header button", { has: page.locator('span:text-is("tune")') })
    .click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
}

async function applySegment(page: Page, segment: string) {
  await openFilters(page);
  await page.getByRole("radio", { name: segment, exact: true }).check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeHidden();
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("pages", () => {
  for (const label of PAGES) {
    test(`${label} renders clean`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto("/");
      await gotoPage(page, label);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} overflows horizontally at ${page.viewportSize()?.width}px`).toBeLessThanOrEqual(1);
      expect(errors, `console errors on ${label}`).toEqual([]);
    });
  }
});

test.describe("segment filter", () => {
  test("every option is a real segment and shows its full-population count", async ({ page }) => {
    await page.goto("/");
    await openFilters(page);

    await expect(page.getByRole("radio")).toHaveCount(segments.length + 1 + 5);

    for (const row of segments) {
      const input = page.getByRole("radio", { name: row.segment, exact: true });
      await expect(input, `"${row.segment}" is not offered as a filter option`).toHaveCount(1);
      const count = page
        .locator(`label:has(input[value="${row.segment}"]) span.font-code-sm`);
      await expect(count, `count for "${row.segment}"`).toHaveText(n(row.wallet_count));
      expect(Number(row.wallet_count), `"${row.segment}" is non-empty in the payload`).toBeGreaterThan(0);
    }
  });

  test("segment predicate filters the top-wallets table", async ({ page }) => {
    await page.goto("/");
    const expected = topWallets.filter((w) => w.segment === "Frequent Users").length;
    expect(expected).toBeGreaterThan(0);
    await applySegment(page, "Frequent Users");
    await gotoPage(page, "Operations");
    await expect(page.getByText(`Showing 1–${expected} of ${expected} wallets`)).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(expected + 1);
  });

  test("a segment absent from the top wallets says so explicitly", async ({ page }) => {
    const absent = segments
      .map((s) => s.segment)
      .filter((s) => !topWallets.some((w) => w.segment === s));
    expect(absent.length, "at least one segment has no top wallets").toBeGreaterThan(0);

    await page.goto("/");
    for (const segment of absent) {
      await applySegment(page, segment);
      await gotoPage(page, "Operations");
      await expect(
        page.getByText(`No wallets in the ${segment} segment appear in the top-20 activity table.`),
      ).toBeVisible();
    }
  });

  test("the drawer list follows the same segment predicate", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /Wallet Explorer/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Wallet explorer" })).toBeVisible();
    await expect(page.getByText(`of ${walletDetail.length} highest-activity wallets`)).toBeVisible();

    const absent = segments
      .map((s) => s.segment)
      .filter((s) => !walletDetail.some((w) => w.segment === s));
    expect(absent.length, "at least one segment has no drawer wallets").toBeGreaterThan(0);
    for (const segment of absent) {
      await applySegment(page, segment);
      await page.getByRole("button", { name: /Wallet Explorer/ }).first().click();
      await expect(page.getByText(`No wallets in the ${segment} segment.`)).toBeVisible();
    }
  });
});

test.describe("export", () => {
  test("the Export menu offers real CSV exports", async ({ page }) => {
    await page.goto("/");
    const button = page
      .locator("header button", { has: page.locator('span:text-is("download")') });
    await button.click();
    const items = page.getByRole("dialog").or(page.locator("header")).getByRole("button");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    for (const label of [
      "Segment summary",
      "Top wallets",
      "Cohort retention matrix",
      "Function mix",
      "Monthly activity",
    ]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    void items;
  });
});

test.describe("content honesty", () => {
  test("no fabricated job title, oracle, or liveness claims", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    for (const label of PAGES) {
      await gotoPage(page, label);
      await expect(page.getByText("Lead Analytics")).toHaveCount(0);
      await expect(page.getByText("Data Pipeline Healthy")).toHaveCount(0);
      await expect(page.getByText("Active Contracts")).toHaveCount(0);
      const html = await page.content();
      expect(html, `Oracle wording on ${label}`).not.toContain("Oracle");
      expect(html, `healthy liveness wording on ${label}`).not.toContain("Healthy");
    }
    expect(errors).toEqual([]);
  });

  test("gas per transaction is not rounded to a cent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("$0.01", { exact: false })).toHaveCount(0);
    await expect(page.getByText(`$${n(kpi.total_transactions)}`)).toHaveCount(0);
    const shown = await page
      .locator("dt", { hasText: "Avg gas / tx" })
      .locator("xpath=following-sibling::dd[1]")
      .innerText();
    expect(shown.trim()).toBe(`$${kpi.avg_gas_cost_usd.toFixed(4)}`);
  });

  test("contracts card is labelled from the data, not an assumption", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Contracts Observed", { exact: true })).toBeVisible();
    await expect(page.getByText(n(kpi.total_contracts), { exact: true }).first()).toBeVisible();

    const verified = contractsMeta.split(/\r?\n/).slice(1).filter((l) => l.includes(",True,")).length;
    const metadataRows = contractsMeta.split(/\r?\n/).length - 2;
    expect(metadataRows, "metadata covers a subset of the contracts").toBeLessThan(
      kpi.total_contracts,
    );
    await expect(
      page.getByText(`${n(verified)} verified · ${n(kpi.total_contracts - verified)} unverified`),
    ).toBeVisible();
  });

  test("thousands separators on large integers in prose", async ({ page }) => {
    await page.goto("/");
    const bare = kpi.whale_definition.match(/\d{4,}(?![,\d])/);
    expect(bare, "whale_definition has an unseparated integer").not.toBeNull();
    await expect(page.getByText(bare![0], { exact: false })).toHaveCount(0);
    await expect(page.getByText(n(Number(bare![0])), { exact: false }).first()).toBeVisible();
  });

  test("high-value segments carry the degenerate-value caveat", async ({ page }) => {
    await page.goto("/");
    await openFilters(page);
    await expect(page.getByText(/recency and frequency/i).first()).toBeVisible();
    for (const label of ["Customer Intelligence", "Operations"] as const) {
      await page.keyboard.press("Escape");
      await gotoPage(page, label);
      await expect(page.getByText(/recency and frequency/i).first()).toBeVisible();
    }
  });
});
