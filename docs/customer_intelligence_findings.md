# Customer Intelligence Findings (Part 5)

RFM segmentation and cohort retention for the Aave V3 Pool on Polygon
(chainid 137). Warehouse: `blockchain_bi` — wallets 18,981, transactions
158,916, token transfers 163. Produced by
`src/analysis/rfm_segmentation.py` and `src/analysis/cohort_retention.py`.

## Segment summary (from `data/processed/segment_summary.csv`)

| Segment | Wallets | % wallets | % native volume | Avg tx / wallet |
|---|---|---|---|---|
| Occasional Users | 8,319 | 43.8% | 0.0% | 2.2 |
| Frequent Users | 3,247 | 17.1% | 0.0% | 25.3 |
| High-Value Dormant | 3,010 | 15.9% | 0.0% | 2.5 |
| High-Value Active | 2,029 | 10.7% | **100.0%** | 101.8 |
| Dormant Users | 1,662 | 8.8% | 0.0% | 1.7 |
| Emerging Users | 472 | 2.5% | 0.0% | 1.3 |
| New Users | 242 | 1.3% | 0.0% | 1.0 |

Segments were scored with SQL `NTILE(5)` per dimension (Recency = days since
last on-chain activity relative to dataset max; Frequency =
`wallets.total_transactions`; Monetary = native POL volume, falling back to
the max non-spam token-transfer amount like the `is_whale_transaction`
definition) and combined with a single `CASE WHEN` — spec-exact mapping, no
gaps. Every wallet got exactly one segment; `wallets.wallet_segment` is
populated for all 18,981 wallets (0 NULLs).

**Lopsidedness check:** largest bucket is 43.8% (Occasional Users, the
fallback bucket), all 7 segments are populated, no bucket approaches 50%.
No threshold adjustment required.

## 1. Which segment holds the most value — and the concentration risk

**High-Value Active holds 100% of the native POL volume** — and that entire
amount is a *single contract wallet*, the Aave V3 Pool itself
(`0x794a…4814ad`, 1,065.51 POL received). This mirrors the Part 4 whale
finding, taken to the extreme: on this pull window the **only** wallet with
native value is a contract, not a user.

Two consequences for the dashboard:

- **Value concentration is an artifact of the data model**, not a signal of a
  wealthy user base. Native POL attaches to the Pool as **gas refunds**; Aave
  positions live as ERC-20 aTokens whose balances are *not* exported at the
  Pool level (schema comment on `wallets.total_volume`). So the Monetary
  dimension is degenerate: 18,974 / 18,981 (99.96%) of wallets tie at \$0
  native value and the M score only spreads them by count. In practice the RFM
  segments are driven by **Recency × Frequency**, which are real and
  informative.
- **The actionable "value" is engagement, not native flow.** The busiest user
  (`0x1b54…b7f0`, 8,054 txs, Frequent Users) and the 2,029 High-Value Active /
  3,247 Frequent Users wallets are the economically meaningful base. A
  dashboard that reports "100% of volume in one segment" must explain the
  aToken caveat or it will mislead executives.

## 2. Is retention improving or declining?

**Declining, with a collapse in the April spike cohort.** Average month-1
retention across cohorts = **21.1%**.

| Cohort | Wallets | Month 1 | Month 2 | Month 3 | Month 4 | Month 5 | Month 6 |
|---|---|---|---|---|---|---|---|
| 2026-03 | 2,793 | 47.0% | 35.1% | 36.0% | 24.4% | 26.0% | 9.5% |
| 2026-04 | 11,094 | 4.7% | 4.7% | 2.7% | 3.0% | 0.8% | — |
| 2026-05 | 1,451 | 27.1% | 12.7% | 12.2% | 2.6% | — | — |
| 2026-06 | 1,653 | 17.2% | 14.2% | 2.4% | — | — | — |
| 2026-07 | 895 | 20.1% | 3.4% | — | — | — | — |
| 2026-08 | 934 | 10.7% | — | — | — | — | — |
| 2026-09 | 149 | — (no data) | — | — | — | — | — |

The April cohort is **58% of all wallets** (11,094 of 18,981), arrived inside
the single week 2026-04-08→14 (the Part 4 activity spike), and retained only
**4.7%** after one month — i.e. it added scale but almost no loyalty. The
initial March cohort retained best (47% → 9.5% at month 6). Post-April cohorts
settle at 10–27% month-1, notably below March.

**Plausible business explanation:** the April 8–14 spike looks like a
promotional / airdrop-farming event (one-shot and bot wallets — Part 4 found
79.5% of senders had exactly one transaction). It inflated active-wallet
counts (Part 4: 12,407 MAU in April vs ~3,000 typical) and central-request
prices without producing durable users. The core user base is the smaller
committed group that keeps transacting through July–September.

## 3. One concrete recommendation (seeds Part 7)

**Attack the month-1 cliff with an onboarding + reactivation program.**
The single largest attrition point is month 0 → 1 (100% → ~21% average), and
the low-cost lever is already-seen traffic:

- **Onboarding for Emerging + New users (714 wallets, 3.8%, all recency=5):**
  they arrived in the last 60 days with 1–2 transactions. An education /
  first-deposit flow could lift their month-1 return, which is currently the
  highest-leverage drop in the funnel.
- **Reactivation for High-Value Dormant (3,010 wallets, 15.9%) and
  Frequent Users (3,247):** historically active (avg 2.5 and 25.3 txs) but
  recently lapsed — cheapest base to win back with targeted incentives.

Both levers are **segments already materialized in `wallets.wallet_segment`**,
so Part 6/7 can slice Power BI by segment and track KPI-02 (headline
month-1 retention = 21.1%) as the success metric.