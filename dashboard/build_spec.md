# Power BI Build Spec — blockchain_bi Dashboard

Exact construction checklist for building `dashboard/blockchain_bi_dashboard.pbix`
in Power BI Desktop from the five extracts in `dashboard/data_extracts/`.
MEASURES → all DAX lives in `dashboard/dax_measures.md`; paste them per page
as noted below.

## Step 0 — Import & model (10 min)

1. Get Data → Text/CSV → import all 5 files from `dashboard/data_extracts/`.
2. Power Query transforms:
   - `fact_transactions`: `event_date` → **Date**, `timestamp` → Date/Time.
   - `dim_wallets`: `first_seen_date`, `last_seen_date` → **Date**.
   - `daily_kpi_summary`: `event_date` → **Date**.
   - `cohort_retention_matrix`: rename columns `0…6` → `Month 0…Month 6`;
     `cohort_month` → **Date** (first day), format as "yyyy-MM".
   - Close & Apply.
3. Create `DateTable` calculated table (DAX in `dax_measures.md`), mark as date
   table (Table tools → Mark as date table → Date column).
4. Build relationships per `dax_measures.md` (fact→dim on `from_wallet` active,
   `to_wallet` inactive, daily_kpi→date, fact_transactions→date).
5. Currency/format: `value_native`, `total_volume`, `monetary_units` → 0 decimals;
   `gas_cost_usd` → $, 2 decimals; percents → percent format.

## Step 1 — Global slicers (apply to ALL pages)

Add a slicer pane with "Sync slicers" enabled for:
- **Date range** → `DateTable[Date]` (Between slicer; default = full window 2026-03-09 → 2026-09-05).
- **Wallet segment** → `dim_wallets[wallet_segment]` (multi-select dropdown).

---

## PAGE 1 — Executive Summary

Layout: 4 KPI cards in top row, then two trend lines, then a callout + MoM table.

| # | Visual | Type | Fields | Values/Measure | Notes |
|---|---|---|---|---|---|
| 1.1 | KPI card | Card | — | `Active Wallets KPI` | subtitle: "active wallets (30d: use slicer)" |
| 1.2 | KPI card | Card | — | `Total Volume KPI` | units POL, 0 decimals |
| 1.3 | KPI card | Card | — | `Whale Tx Concentration %` | headline: top 1% wallets drive ~49% of txs |
| 1.4 | KPI card | Card | — | `Average Month-1 Retention` | headline retention KPI |
| 1.5 | Line chart | Line | X = `DateTable[Date]` | Y = `Active Wallets KPI` | trend line: daily active wallets |
| 1.6 | Line chart | Line | X = `DateTable[Date]` | Y = `Total Volume KPI` | trend line: transaction volume |
| 1.7 | Callout | Text box | — | static text | biggest Part 4/5 finding, e.g. "One wallet contract holds 100% of native value; top 1% of wallets drive 49% of all transactions" |
| 1.8 | Table | Table | Segment | `Active Wallets KPI`, `Total Volume KPI` or MoM | optional MoM table w/ `Active Wallets MoM %`, `Total Volume MoM %` (month drilled) |

## PAGE 2 — Customer Intelligence (segment slicer active)

| # | Visual | Type | Fields | Values | Notes |
|---|---|---|---|---|---|
| 2.1 | Donut | Donut chart | Legend = `dim_wallets[wallet_segment]` | Values = `Segment Wallet Count` | wallet count by segment |
| 2.2 | Bar | Clustered bar | Axis = `rfm_segment_summary[segment]` | Values = `Segment Volume Share %` | volume % by segment — shows concentration |
| 2.3 | Table | Table | `rfm_segment_summary` all cols | — | conditional formatting → data bars / color scale on `pct_volume` column |
| 2.4 | Scatter | Scatter chart | X = `dim_wallets[recency_days]`, Y = `dim_wallets[total_transactions]` | Legend = `dim_wallets[wallet_segment]` | log Y axis; size maybe `Segment Wallet Count`; play on data size |
| 2.5 | Card | Card | — | `Segment Wallet Count Share %` | optional |

## PAGE 3 — Retention Analysis

| # | Visual | Type | Fields | Values | Notes |
|---|---|---|---|---|---|
| 3.1 | Matrix | Matrix heatmap | Rows = `cohort_month`, Columns = `Month 0…Month 6` | values = Sum of selected month column | subtotals OFF; conditional formatting color scale; blank cells = no data yet |
| 3.2 | Line | Line chart | X = `cohort_month` | Y = `Month 1` | month-1 retention trend across cohorts |
| 3.3 | Card | Card | — | `Average Month-1 Retention` | avg = 21.1% |

## PAGE 4 — Operations & Cost

| # | Visual | Type | Fields | Values | Notes |
|---|---|---|---|---|---|
| 4.1 | Line | Line | X = `DateTable[Date]` | Y = `Total Gas Cost (USD)` | gas cost over time |
| 4.2 | Line | Line | X = `DateTable[Date]` | Y = `Gas Cost % of Transaction Value (KPI-04)` | interpret as "gas dominates native value" (see DAX note) |
| 4.3 | Table | Table | `dim_wallets` | Top 10 by `total_volume` + `wallet_segment`, `total_transactions`, `recency_days` | explicit Top-N filter = 10 |
| 4.4 | Matrix | Matrix | Rows = `hour_utc`, Columns = `weekday` | Values = `Total Transactions` | heatmap style; color scale |

## PAGE 5 — Recommendations (placeholder until Part 7)

Empty page with a text box: "Recommendations — populated in Part 7
(business recommendations report)."

## Step 2 — Final checks before saving

1. **Recruiter test (5 seconds)**: Page 1's top-left should scream the headline
   — the highest-contrast card is `Whale Tx Concentration %` (~49%) and / or
   `Average Month-1 Retention` (21.1%). Resize/reorder so those lead.
2. Global slicers synced on all pages (File → Options → Sync slicers).
3. Save as `dashboard/blockchain_bi_dashboard.pbix` (gitignored).
4. Export pages → `outputs/figures/dashboard/` (File → Export → PDF, convert
   pages to PNG at high res). These PNGs are the portfolio/README artifacts.
5. Sanity: `Total Transactions` on Page 1 = 158,916 with global slicer at max
   range; volume = 1,065.51 POL; gas = $1,157.61.