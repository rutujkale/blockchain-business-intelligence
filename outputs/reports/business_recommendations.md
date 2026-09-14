# Business Recommendations Report

**Blockchain Business Intelligence — Aave V3 Pool on Polygon PoS**
**Prepared for:** Executive, Product, Finance, Operations, Risk review
**Window:** 2026-03-09 → 2026-09-05 · **Data volume:** 18,981 wallets · 158,916 transactions · 159 contracts · 163 token transfers

---

## 1. Executive Summary

We analyzed every on-chain interaction with the Aave V3 Pool contract on
Polygon (`0x794a…4814ad`) over six months: 18,981 wallets, 158,916
transactions. The headline is not growth — it is a spike and a decay.
Active wallets peaked at **12,407 in April**, then fell **−94%** to a partial
716 in September; a seven-day moving average confirms a structural downtrend,
not seasonality. What remains is thin but maturing: the **top 1% of wallets
(~190) drive ~49% of all transactions**, and new-wallet share fell from 100%
(March) to ~21% (September) as a small retained core came to dominate the base.

Two measurement facts shape every downstream decision. First, **value is
degenerate at the Pool level**: the Pool contract itself absorbs ~100% of
received native POL (positions move as ERC-20 aTokens), so monetary KPIs read
near zero and must be rebuilt from function-level deposits/withdrawals, not
Pool-level volume. Second, **cost is trivial** — ~$0.0073 per transaction
(~$1,158 total) — so Aave on Polygon is operationally cheap; the economics
problem is measurement, not cost.

**Implication in one sentence:** treated as a durable user base, the protocol
is small and at risk — the strategic priority is retaining the committed core
and fixing value measurement before any acquisition spend, and the operational
priority is formalizing the concentration and automation risk that a handful
of power wallets currently represents.

---

## 2. Methodology

This report is a synthesis of the full analysis pipeline built across the
project — no new numbers were invented; every figure below was computed from
the pipeline and re-verified against the warehouse (see the Appendix for the
exact query/notebook backings). Full methodology: `docs/methodology.md`.

- **Data:** public Polygon PoS records for the Aave V3 Pool source contract,
  pulled via the Polygonscan API (Etherscan V2, chainid 137) and stored in a
  local PostgreSQL 16 warehouse (`wallets`, `transactions`, `contracts`,
  `token_transfers`; schema in `data/sql/schema.sql`).
- **Tools:** Python (pandas, SQLAlchemy, matplotlib/seaborn, nbformat),
  PostgreSQL window queries, SQL NTILE/cohort analysis, Power BI Desktop
  (DAX measures + 5-page dashboard).
- **Analysis stages:** cleaning ↔ acquisition (Part 2/3) → EDA with 11 charts
  and key findings (Part 4, `notebooks/01_eda.ipynb`) → RFM segmentation and
  cohort retention (Part 5, `src/analysis/rfm_segmentation.py`,
  `cohort_retention.py`) → dashboard extracts + DAX (Part 6,
  `src/analysis/export_for_dashboard.py`, `dashboard/`).
- **In scope:** the Aave V3 Pool contract on Polygon; wallet- and
  transaction-level activity, gas cost, RFM segments, cohort retention.
- **Out of scope:** other Aave markets/chains, off-chain/user-level data,
  token price forecasting, and function-level deposit/borrow values (flagged
  as the central measurement gap; aToken balances are not exported at the
  Pool level).

---

## 3. Key Findings

### Finding 3.1 — Activity collapsed after a single April spike

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/01_daily_active_wallets.png`, `02_new_vs_returning_monthly.png`; `notebooks/01_eda.ipynb` §1; `dashboard/data_extracts/daily_kpi_summary.csv` |
| **Business impact** | The protocol is not growing. Any growth narrative built on the April number (12,407 MAU, ~49.4K txs, 4,874 txs on a single peak day) is false advertising to leadership and stakeholders. |
| **Confidence** | **High** — simple COUNT window queries over the full clean ledger; no estimation involved. |

### Finding 3.2 — The surviving base is one-shot-heavy but maturing

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/02_new_vs_returning_monthly.png`, `03_tx_per_wallet_dist.png`; `notebooks/01_eda.ipynb` §1; scenario from `rfm_segment_summary.csv` |
| **Business impact** | 79.5% of the 18,968 distinct senders transacted in a single month; yet new-wallet share fell 100% → ~21%, so the smaller later base is increasingly *retained* users. The funnel is acquisition-heavy with a thin loyal core — re-engagement, not acquisition, is where growth effort pays. |
| **Confidence** | **High** — direct counts from `wallets.first_seen_date` / `transactions`. |

### Finding 3.3 — Extreme user concentration; native value is degenerate

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/10_concentration.png`, `11_top_10_wallets.png`, `05_value_distribution_whale.png`; `notebooks/01_eda.ipynb` §4; DAX `Whale Tx Concentration %` |
| **Business impact** | Top 1% of user wallets (~190) drive ~49% of transactions; the busiest user (`0x1b54…b7f0`) executed 8,054 txs. Meanwhile ~100% of *native value* sits in the Pool contract itself (one 1,000-POL `supply` tx dominates; median tx value = 0 POL). Dependency risk is real and unmitigated; value-based whale lists are currently meaningless at the Pool level. |
| **Confidence** | **Medium** — activity concentration is a direct computation (High); the "automated agents" reading of the power users is inferred from timing/behaviour, not proven (see 3.5). |

### Finding 3.4 — Costs are negligible; the native value signal is not meaningful

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/07_gas_cost_trend.png`, `08_gas_pct_of_value.png`, `09_value_vs_gas_scatter.png`; `notebooks/01_eda.ipynb` §3 |
| **Business impact** | ~$0.0073/transaction, ~$1,158 total: operating on Polygon is cheap for users and for the protocol. The "gas as % of value" ratio and the value×gas correlation (r = −0.05, p = 0.75, n = 38 value-carrying txs) are noise, because value is carried as aTokens, not native POL. Fee economics must be re-measured at function level before Finance can price or campaign on them. |
| **Confidence** | **High** for the cost numbers (computed from `gas_used × gas_price` with the POL-USD feed); the *interpretation* that value KPIs are degenerate is well-evidenced but reflects a known data-model constraint (Medium). |

### Finding 3.5 — Activity is timed like orchestrated/bot usage

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/06_hour_dow_heatmap.png`; `notebooks/01_eda.ipynb` §2 |
| **Business impact** | Activity clusters at 12:00 UTC on Thursdays inside a narrow band of mid-week hours, with near-zero weekend traffic. Consistent with automated agents/aggregators rather than organic retail. Botters distort MAU, waste measurement, and concentrate risk; they are also a segment Operations can serve deliberately. |
| **Confidence** | **Medium** — the pattern is certain; *why* is circumstantial (no wallet-fingerprinting was done). |

### Finding 3.6 — Retention is poor, and the acquisition spike cohort retained almost no one

| | |
|---|---|
| **Supporting evidence** | `outputs/figures/cohort_retention_heatmap.png`; `dashboard/data_extracts/cohort_retention_matrix.csv`; `docs/customer_intelligence_findings.md` |
| **Business impact** | Average month-1 retention = **21.1%**. The April cohort (11,094 wallets — 58% of the entire base) retained just **4.7%** after one month; the March cohort held 47%. RFM segments: 43.8% Occasional, 17.1% Frequent, 15.9% High-Value Dormant, 10.7% High-Value Active, 8.8% Dormant, 2.5% Emerging, 1.3% New (Monetary is degenerate → segments are Recency×Frequency driven). Retention, not acquisition, is the highest-leverage intervention. |
| **Confidence** | **High** — cohort/segment counts recomputed from `wallets.first_seen_date` and per-month activity; every wallet assigned exactly one segment (18,981/18,981, 0 gaps). |

---

## 4. Recommendations

### R-1 · Attack the month-1 retention cliff (Highest priority — retention)

| | |
|---|---|
| **Rationale** | Finding 3.6: month-1 retention averages 21.1%; the single sharpest drop in the entire funnel is month 0 → 1. New + Emerging users (714 wallets) and the High-Value Dormant segment (3,010) are the cheapest to win back. |
| **Priority** | **High** |
| **Owner** | **Product Manager** (stakeholder map) |
| **Maps to** | BR-02 (Retention Analysis), BR-05 (Customer Segmentation) |
| **Suggested next step** | Within 30 days, ship a first-supply onboarding flow (education + deposit) targeting New/Emerging wallets and launch a reactivation campaign over High-Value Dormant + Frequent Users (6,257 wallets). Success metric: average month-1 retention from 21.1% toward 30%, and >10% of the reactivated dormant segment active again within 90 days. |

### R-2 · Formalize the concentration / dependency risk (Whale finding)

| | |
|---|---|
| **Rationale** | Finding 3.3 + 3.5: top 1% (~190 wallets) = ~49% of transactions; power users look automated. One automated account departing is a material activity drop. |
| **Priority** | **High** |
| **Owner** | **Operations** (stakeholder map) |
| **Maps to** | BR-04 (Whale / High-Value User Identification), BR-07 (Anomaly / Risk Flagging) |
| **Suggested next step** | Add a weekly dependency metric to the dashboard — the top-1% share of transaction count with a rule: alert if it exceeds 60% of any 7-day window (it is ~49% today). Build and maintain a key-account list for the ~50 highest-activity wallets (they are already in `dim_wallets.csv`), and classify them agent vs retail so the dependency number is intelligible. |

### R-3 · Fix the value-measurement gap before any pricing/campaigning

| | |
|---|---|
| **Rationale** | Findings 3.3 + 3.4: native value is degenerate at the Pool level, so KPI-03/04/07 and all "volume by segment" visuals are not economically real. You cannot price, fee, or market on numbers that read ~$0. |
| **Priority** | **High** |
| **Owner** | **Finance** (with data engineering) |
| **Maps to** | BR-03 (Transaction Cost Analysis), BR-04 (Whale Identification) |
| **Suggested next step** | Extend the warehouse with function-level call decoding (deposit/borrow/withdraw/repay amounts) and load a real-time POL-USD + aToken price reference (the current POL-USD feed is a single static value captured at load time). Recompute the monetary KPIs and the HVA/HVD segment value splits from the decoded values, not Pool-level `value_native`. |

### R-4 · Reframe the growth narrative around a durable-base KPI

| | |
|---|---|
| **Rationale** | Findings 3.1 + 3.2: the April spike was 58% of the base and retained 4.7%; MAU as currently presented overstates health. |
| **Priority** | **Medium** |
| **Owner** | **Executive / Leadership** |
| **Maps to** | BR-01 (User Growth Tracking) |
| **Suggested next step** | Add a "retained core" measure to Page 1 of the dashboard — wallets active in ≥2 of the last 3 months (computed from `dim_wallets[first_seen_date]/[last_seen_date]`) — as the second headline card next to MAU, and set a growth target on it. Report these two numbers together so a spike cannot masquerade as growth. |

### R-5 · Keep Polygon as the operating chain; re-measure cost economics after R-3

| | |
|---|---|
| **Rationale** | Finding 3.4: ~$0.0073/tx validates the cost side of the Polygon thesis. There is no cost-discount lever to pull; the economics work is measurement, not migration. |
| **Priority** | **Low** |
| **Owner** | **Finance** |
| **Maps to** | BR-03 (Transaction Cost Analysis) |
| **Suggested next step** | After R-3 lands, recompute gas-as-% of transaction value from function-level values, and set an efficiency threshold (e.g., gas ≤ 0.5% of transferred value by function) that surfaces in the cost page. Until then, stop reporting the degenerate ratio. |

### R-6 · Build explicit bot/anomaly detection into the risk log

| | |
|---|---|
| **Rationale** | Finding 3.5: a tight 12:00-UTC Thursday cluster with near-zero weekends is characteristic of orchestrated activity; 2.84% of transactions (4,514) already fail. Risk should see this explicitly, not infer it. |
| **Priority** | **High** |
| **Owner** | **Risk / Compliance** |
| **Maps to** | BR-07 (Anomaly / Risk Flagging) |
| **Suggested next step** | Add a detection rule to the anomaly log (`flagged_transactions.csv` pipeline): flag wallets whose activity is ≥90% inside the observed peak hour-DOW cluster, and alert on per-wallet daily rate spikes. This turns the F5 timing observation into an operational, queryable risk signal. |

> **Owner checklist (Part 7 gate):** each Owner above should be able to answer "what, exactly, do I do next" from the Suggested next step — R-1 has a target and a 30-day deadline; R-2 has a threshold and a rule; R-3 names the exact schema change; R-4 names the measure; R-5 is gated on R-3; R-6 names the rule and the log. If any read as vague, tighten them before this report is circulated.

---

## 5. Limitations & Caveats

- **Wallet addresses are not people.** One person can control many wallets, and one wallet can be shared by automated agents. All analysis is aggregated per address; "user" and "wallet" are used interchangeably in this report and are not equivalent to unique humans.
- **On-chain native value ≠ USD revenue.** No token-USD price oracle is applied to aToken/ERC-20 positions; native value is the only directly "priced" flow, and it is degenerate at the Pool level (Approx 100% of received POL is gas-refund mechanics, not user deposits). USD figures for gas use a single POL-USD feed value captured at load time.
- **Single protocol, single chain, single window.** Results describe *this* Aave V3 Pool on Polygon during 2026-03-09 → 2026-09-05 (September partial, 716 MAU through 09-05). They do not generalize to other markets, chains, or periods. No forecasting is attempted.
- **Automation may inflate activity.** The Pool contract is the recipient of every transaction (158,916), and the busiest user is consistent with an automated aggregator. The Pool contract was set aside for *user-level* concentration (F3), but raw counts above include it; bot addresses were not de-duplicated.
- **Failed transactions are counted.** 4,514 of 158,916 (2.84%) have `status = 0` and are included in raw activity counts (they are logged separately in the anomaly pipeline, per BR-07).
- **Token transfers are mostly spam and un-priced.** 156 of 163 are unverified spam tokens, and the warehouse holds no token decimals or prices for the remaining 7, so token-level value cannot close the monetary gap without R-3.
- **Retention is transaction-based.** A wallet is "active" in a month only if it transacted; a holder or borrower with no on-chain activity that month is counted inactive. Deposit-value retention is only estimable after function-level decoding (R-3).

---

## 6. Appendix

### Dashboard

- Live/desktop build: `dashboard/blockchain_bi_dashboard.pbix` (local; gitignored)
- Build instructions + DAX: `dashboard/build_spec.md`, `dashboard/dax_measures.md`
- Page screenshots: `outputs/figures/dashboard/blockchain_bi_dashboard_page-0001.png` … `-0005.png`
- Data extracts (Power BI input): `dashboard/data_extracts/` (5 CSVs; `fact_transactions.csv` is local-only, gitignored)

### Repository structure

```
docs/          business requirements, KPI framework, stakeholder map, findings
data/          raw/cleaned csv + SQL schema (raw & processed are gitignored)
src/           acquisition (Part 2) · transformation (Part 3) · analysis (Parts 4-6)
notebooks/     01_eda.ipynb — executed EDA with key findings (Part 4)
outputs/       figures/ (11 EDA charts + dashboard screenshots) · reports/ (this report)
dashboard/     extracts, DAX measures, build spec, .pbix (local)
```

### Finding → backing artifacts

| Finding | Primary backing |
|---|---|
| 3.1 Activity collapse | `notebooks/01_eda.ipynb` §1 (SQL date-bucketed counts), `outputs/figures/01_daily_active_wallets.png`, `dashboard/data_extracts/daily_kpi_summary.csv` |
| 3.2 One-shot base / maturing | `notebooks/01_eda.ipynb` §1, `outputs/figures/02_new_vs_returning_monthly.png`, `03_tx_per_wallet_dist.png` |
| 3.3 Concentration / degenerate value | `notebooks/01_eda.ipynb` §4, `outputs/figures/10_concentration.png`, `11_top_10_wallets.png`, `05_value_distribution_whale.png`, DAX `Whale Tx Concentration %` (`dashboard/dax_measures.md`) |
| 3.4 Cost vs value | `notebooks/01_eda.ipynb` §3, `outputs/figures/07_gas_cost_trend.png`, `08_gas_pct_of_value.png`, `09_value_vs_gas_scatter.png` |
| 3.5 Bot-like timing | `notebooks/01_eda.ipynb` §2, `outputs/figures/06_hour_dow_heatmap.png` |
| 3.6 Retention / segments | `src/analysis/cohort_retention.py` → `data/processed/cohort_retention.csv`; `src/analysis/rfm_segmentation.py` → `segment_summary.csv`; `docs/customer_intelligence_findings.md`; `outputs/figures/cohort_retention_heatmap.png` |