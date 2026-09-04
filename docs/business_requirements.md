# Business Requirements Document (BRD)

**Project:** Blockchain Business Intelligence — On-Chain Analytics
**Prepared for:** Stakeholder review
**Scope:** One DeFi protocol on Polygon, 6-month window, wallet/transaction-level
analysis
**Related documents:** `stakeholder_map.md`, `kpi_framework.md`

---

## BR-01 — User Growth Tracking

- **Priority:** High
- **Serves:** Executive / Leadership
- **Description:** Establish a reliable measure of how the protocol's user base
  is growing over time — daily and monthly active wallets, plus the split
  between new and returning wallets. This is the headline health metric for
  leadership reporting.
- **Acceptance Criteria:**
  - Daily and monthly active wallet counts are computable for every day/month
    in the dataset window.
  - New vs returning wallet counts are available per month.
  - All numbers are reproducible from the `transactions` and `wallets` tables
    via documented SQL.

## BR-02 — Retention Analysis

- **Priority:** High
- **Serves:** Product Manager
- **Description:** Determine whether wallets that engage with the protocol
  come back, and whether retention is improving across acquisition cohorts.
  Answers "are we building a durable user base or churning through users?"
- **Acceptance Criteria:**
  - Each wallet is assigned to a cohort by month of first transaction.
  - Retention % per cohort per subsequent month is computed (through month 5
    or the limit of the data window).
  - A single headline stat, average Month-1 retention across cohorts, is
    produced for the executive dashboard.

## BR-03 — Transaction Cost Analysis

- **Priority:** Medium
- **Serves:** Finance
- **Description:** Quantify the cost of interacting with the protocol — gas
  paid in native tokens and, where a price reference is available, its USD
  equivalent — and express those costs relative to transaction value. Gas on
  Polygon is near-zero but non-trivial vs small transfers, so the ratio
  matters.
- **Acceptance Criteria:**
  - `gas_cost_native` is computed for every transaction as
    `gas_used * gas_price`.
  - Gas cost as % of transaction value is computable over any date range.
  - If an external price oracle is unavailable, USD conversion is documented
    as a limitation rather than estimated.

## BR-04 — Whale / High-Value User Identification

- **Priority:** High
- **Serves:** Operations
- **Description:** Identify the small set of wallets that drive a
  disproportionate share of volume, quantify concentration (top 1% of wallets
  by value), and flag whale transactions. Concentration is both a business
  opportunity (key accounts) and a dependency risk (base erosion if they
  leave).
- **Acceptance Criteria:**
  - `is_whale_transaction` flag set using a top-0.5% percentile cutoff on
    transaction value.
  - Whale concentration % (volume from top 1% of wallets / total volume) is
    computable for the full window.
  - Top-10 wallets by volume reportable with transaction count and
    first/last seen dates.

## BR-05 — Customer Segmentation

- **Priority:** Medium
- **Serves:** Product Manager (primary), Operations (secondary)
- **Description:** Group wallets into actionable segments (e.g. high-value
  active, dormant, emerging, new) using Recency-Frequency-Monetary scoring, so
  the organization can tailor outreach, incentives, and risk treatment instead
  of treating all wallets alike.
- **Acceptance Criteria:**
  - Every wallet is assigned to exactly one segment (no gaps, no overlaps).
  - Segment summary (count, % of wallets, % of volume, avg transactions per
    wallet) is producible as a single report table.
  - Segment assignment is written back to `wallets.wallet_segment`.

## BR-06 — Protocol Usage Trends

- **Priority:** Medium
- **Serves:** Executive / Leadership
- **Description:** Surface how, when, and how much the protocol is used over
  time — volume trends (with moving averages), hourly/day-of-week activity
  patterns, and value distributions. Identifies growth/decline phases and
  operating cadence the leadership team can act on.
- **Acceptance Criteria:**
  - Transaction volume time series with 7-day moving average is computable in
    SQL (window function).
  - Activity heatmap by hour-of-day × day-of-week is producible.
  - Value distribution (with whale vs non-whale split) is available as
    histogram/box-plot summaries.

## BR-07 — Anomaly / Risk Flagging

- **Priority:** High
- **Serves:** Risk / Compliance
- **Description:** Detect and log unusual activity — failed transactions,
  zero-value or self-transactions, outlier-sized transfers, and statistically
  unexpected concentration shifts. Risk should never be silently dropped or
  merged away in the pipeline.
- **Acceptance Criteria:**
  - Failed (status=0), self-, and zero-value transactions are flagged and
    logged separately, never silently dropped.
  - Anomalous transactions (top-0.5% value outliers) are identifiable.
  - Correlation between transaction value and gas cost is computed and stated
    explicitly as a structural signal, not assumed.

---

## Requirement → KPI traceability

| Requirement | Primary KPI(s) served |
|---|---|
| BR-01 | KPI-01 Active Wallets; KPI-06 New vs Returning Wallet Ratio |
| BR-02 | KPI-02 Retention Rate by Cohort |
| BR-03 | KPI-03 Average Transaction Value; KPI-04 Gas Cost % of Transaction Value; KPI-07 Median Transaction Value |
| BR-04 | KPI-05 Whale Concentration % |
| BR-05 | KPI-02 Retention Rate by Cohort (segment-level); KPI-05 Whale Concentration % (segment volume split) |
| BR-06 | KPI-01 Active Wallets; usage-trend outputs (charts/queries) |
| BR-07 | KPI-05 Whale Concentration %; KPI-07 Median Transaction Value; anomaly logging outputs |

Traceability is bidirectional — every KPI in `kpi_framework.md` maps back to at
least one requirement above.