import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { PipelineMeta } from "@/lib/types";

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
  total_gas_cost_usd: number;
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

/** Mirrors the app's `decN` money formatting: grouped integer part, fixed
 *  fractional part. Grouping is applied to the integer part only, so 0.0073
 *  stays "0.0073" rather than becoming "0,073". */
const money = (v: number, dp: number) => {
  const [whole, frac = ""] = v.toFixed(dp).split(".");
  return `$${n(Number(whole))}${frac ? `.${frac}` : ""}`;
};

async function gotoPage(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
}

/**
 * The radio's accessible name is the whole wrapping label ("Dormant Users
 * 1,662"), so identity is asserted on `value` instead. That is also the more
 * meaningful assertion: `value` is exactly the key the filter predicate
 * compares against `wallet.segment`, so a renamed or invented option fails
 * here rather than silently matching nothing downstream.
 */
async function openFilters(page: Page) {
  await page
    .locator("header button", { has: page.locator('span:text-is("tune")') })
    .click();
  // The sheet is always in the DOM; `pointer-events-none` is how it marks
  // itself closed, so that class is the real open/closed signal.
  await expect(page.getByRole("dialog", { name: "Filters" })).not.toHaveClass(
    /pointer-events-none/,
  );
}

async function applySegment(page: Page, segment: string) {
  await openFilters(page);
  await page
    .locator(`input[name="segment"][value="${segment}"]`)
    .check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toHaveClass(
    /pointer-events-none/,
  );
}

/** Opens the Wallet Explorer drawer. The drawer is modal, so the header is
 *  not reachable while it is open — close it before touching the filters. */
async function openExplorer(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Wallet Explorer/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Wallet explorer" })).toBeVisible();
}

async function closeExplorer(page: Page) {
  await page.getByRole("button", { name: "Close wallet explorer" }).click();
  await expect(page.getByRole("dialog", { name: "Wallet explorer" })).toHaveCount(0);
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

    // 7 segments + "All segments", and 5 functions + "All functions". Counting
    // the two groups separately keeps this honest if either list gains a row.
    await expect(page.locator('input[name="segment"]')).toHaveCount(segments.length + 1);
    await expect(page.locator('input[name="function"]')).toHaveCount(6);

    for (const row of segments) {
      const input = page.locator(`input[name="segment"][value="${row.segment}"]`);
      await expect(input, `"${row.segment}" is not offered as a filter option`).toHaveCount(1);
      const count = page.locator(
        `label:has(input[name="segment"][value="${row.segment}"]) span.font-code-sm`,
      );
      await expect(count, `count for "${row.segment}"`).toHaveText(n(row.wallet_count));
      expect(
        Number(row.wallet_count),
        `"${row.segment}" is non-empty in the payload`,
      ).toBeGreaterThan(0);
    }
  });

  test("segment predicate filters the top-wallets table", async ({ page }) => {
    await page.goto("/");
    const expected = topWallets.filter((w) => w.segment === "Frequent Users").length;
    expect(expected).toBeGreaterThan(0);
    await applySegment(page, "Frequent Users");
    await gotoPage(page, "Operations");

    // The summary is present at every width; below md the rows collapse to
    // cards, so only assert the row count when the table is actually shown.
    await expect(page.getByText(`Showing 1–${expected} of ${expected} wallets`)).toBeVisible();
    const table = page.getByRole("table");
    if (await table.isVisible()) {
      await expect(page.getByRole("row")).toHaveCount(expected + 1);
    }
    // Every surviving row must really be in the selected segment.
    for (const cell of await page.locator("table tbody tr").all()) {
      expect(await cell.innerText()).toContain("Frequent Users");
    }
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

  test("the Currently Active KPI actually excludes what it claims", async ({ page }) => {
    await page.goto("/");
    await gotoPage(page, "Customer Intelligence");
    const total = segments.reduce((a, r) => a + r.wallet_count, 0);
    const excluded = segments
      .filter((r) => ["New Users", "Dormant Users"].includes(r.segment))
      .reduce((a, r) => a + r.wallet_count, 0);
    expect(excluded, "New and Dormant are non-empty").toBeGreaterThan(0);
    await expect(page.getByText("Currently Active")).toBeVisible();
    // A card labelled "excludes New and Dormant" that sums every segment is
    // indistinguishable from the total, which is how 18,981 shipped.
    await expect(
      page
        .getByText("Currently Active")
        .locator("xpath=../following-sibling::*[1]"),
    ).toHaveText(n(total - excluded));
  });

  test("the drawer list follows the same segment predicate", async ({ page }) => {
    await page.goto("/");
    const absent = segments
      .map((s) => s.segment)
      .filter((s) => !walletDetail.some((w) => w.segment === s));
    expect(absent.length, "at least one segment has no drawer wallets").toBeGreaterThan(0);

    await openExplorer(page);
    await expect(page.getByText(`of ${walletDetail.length} highest-activity wallets`)).toBeVisible();

    for (const segment of absent) {
      await closeExplorer(page);
      await applySegment(page, segment);
      await openExplorer(page);
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
    expect(shown.trim()).toBe(money(kpi.avg_gas_cost_usd, 4));
  });

  test("total gas is not truncated to a whole dollar", async ({ page }) => {
    await page.goto("/");
    const total = money(kpi.total_gas_cost_usd, 2);
    // `int()` used to render this as "$1", which is a 99.9% understatement
    // of the real figure rather than a rounding of it.
    expect(Number(kpi.total_gas_cost_usd), "total gas is not under a dollar").toBeGreaterThan(1);
    await expect(page.getByText("Total gas").locator("xpath=following-sibling::dd[1]")).toHaveText(
      total,
    );
    await gotoPage(page, "Operations");
    await expect(page.getByText(total, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${money(kpi.avg_gas_cost_usd, 4)}/tx`)).toBeVisible();
  });

  test("provenance figures are not silently zero", async ({ page }) => {
    await page.goto("/");
    await gotoPage(page, "System");
    const meta = payload<PipelineMeta>("pipeline_meta.json");
    const e = meta.extraction as Record<string, string | number | boolean>;
    const c = meta.cleaning as Record<string, string | number | boolean>;
    expect(Number(e.transactions_raw)).toBeGreaterThan(0);
    expect(Number(c.transactions_clean_rows)).toBeGreaterThan(0);
    expect(String(e.block_range)).toMatch(/\d/);
    // Reading a key that does not exist yields 0, and `?? 0` hides it. A
    // "0" anywhere in provenance means the field name drifted, not that the
    // pipeline did nothing.
    await expect(page.getByText("Rows In")).toBeVisible();
    await expect(
      page.getByText("Rows In").locator("xpath=../following-sibling::*[1]"),
    ).toHaveText(n(Number(e.transactions_raw)));
    await expect(
      page.getByText("Rows Cleaned").locator("xpath=../following-sibling::*[1]"),
    ).toHaveText(n(Number(c.transactions_clean_rows)));
    // Rendered twice: once in Pipeline Provenance, once in the generic
    // Extraction key dump. Pre-existing redundancy, not introduced here.
    await expect(page.getByText(String(e.block_range)).first()).toBeVisible();
    await expect(page.getByText(/0\s*—\s*0/)).toHaveCount(0);
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
    await page.keyboard.press("Escape");
    for (const label of ["Customer Intelligence", "Operations"] as const) {
      await gotoPage(page, label);
      await expect(page.getByText(/recency and frequency/i).first()).toBeVisible();
    }
    // The drawer must disclose it in both of its list states.
    await openExplorer(page);
    await expect(page.getByText(/recency and frequency/i).first()).toBeVisible();
    await closeExplorer(page);
    await applySegment(page, "New Users");
    await openExplorer(page);
    await expect(page.getByText(/recency and frequency/i).first()).toBeVisible();
  });
});
