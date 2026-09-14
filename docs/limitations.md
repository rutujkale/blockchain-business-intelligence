# Limitations & Caveats

Standalone version of the limitations raised in
`outputs/reports/business_recommendations.md`. Every assumption and known gap
is stated honestly here — the intent is that a skeptical reader can reproduce
the analysis and decide how much weight each finding deserves.

Each limitation lists: **what it is**, **why it matters**, and **what was done
about it (or what it would take to fix it)**.

## 1. Scope: one contract, one chain, one six-month window

- **What:** The dataset is every transaction against the Aave V3 Pool on
  Polygon between 2026-03-09 and 2026-09-05 (181 days). September is partial
  (through 09-05; 716 active wallets).
- **Why it matters:** Findings describe *this contract on this chain in this
  window*. They do not generalize to other Aave markets, other chains, or
  other periods. No forecast is attempted.
- **Mitigation:** every number in the reports is scoped to this window and the
  partial September is flagged wherever it is cited.

## 2. Wallet addresses are not people

- **What:** "Active wallet" counts distinct addresses, not unique humans. One
  person can control many wallets; one wallet can be an automated agent.
- **Why it matters:** MAU, segmentation, and retention figures over- or
  understate the true user base depending on the multi-wallet/agent mix.
- **Mitigation:** the report uses "wallet" and "user" with that caveat in mind;
  the bot-like timing finding (Finding 3.5) explicitly hedges its confidence
  at Medium because no wallet-fingerprinting was done.

## 3. Native value is degenerate — the central measurement gap

- **What:** Aave positions move as ERC-20 aTokens, not as native POL. Pool-level
  native value attaches almost entirely to the Pool contract itself (1,065.51
  POL received, effectively gas-refund mechanics), so `wallets.total_volume`
  and `transactions.value_native` are ≈ $0 for real users. Only **38 of
  158,916** transactions carry native value; the median transaction value is 0
  POL.
- **Why it matters:** monetary KPIs (KPI-03/04/07), "volume by segment", and
  value-based whale lists read near zero and would mislead anyone who takes
  them at face value.
- **Mitigation / fix:** documented in the data dictionary and reports; the
  recommended fix (Recommendation R-3) is function-level decoding of
  `supply/borrow/withdraw/repay` calls plus a real-time POL/USD and aToken
  price reference. Until then, value figures are reported as degenerate and the
  RFM segments are described as R×F driven (Monetary contributes little).

## 4. Token transfers are mostly spam and un-priced

- **What:** 156 of 163 token transfers are unverified spam airdrops. The
  warehouse stores no token decimals or prices for the remaining transfers.
- **Why it matters:** token-level value cannot close the monetary gap; spam
  transfers are correctly excluded from activity and retention, but their
  parent transactions are not part of the Pool ledger by design.
- **Mitigation:** spam is flagged (`is_spam`) and excluded from monetary
  fallback and activity; the residual gap is owned by R-3.

## 5. Failed, self, and zero-value transactions are counted

- **What:** 4,514 of 158,916 transactions (2.84%) have `status = 0`. Failed,
  self, and zero-value rows are flagged — never dropped.
- **Why it matters:** raw activity counts include failed attempts, slightly
  inflating demand-side numbers.
- **Mitigation:** they are isolated in `flagged_transactions.csv` and surfaced
  as an anomaly/risk input (BR-07) rather than silently hidden.

## 6. Automated / bot activity may inflate the base

- **What:** The busiest wallet executed 8,054 transactions; activity clusters
  at 12:00 UTC on Thursdays with near-zero weekends — a pattern consistent
  with automated agents/aggregators. The Pool contract itself is the recipient
  of every transaction and is set aside only for *user-level* concentration
  analysis.
- **Why it matters:** MAU and transaction counts overstate organic retail
  usage; top-wallet dependency risk is real.
- **Mitigation:** the timing finding is labeled Medium confidence; bot
  addresses were not de-duplicated (flagged as future work in R-6).

## 7. Retention is transaction-based

- **What:** A wallet is "active" in a month only if it transacted. A holder or
  borrower with no on-chain activity that month is counted as inactive; native
  value is not a retention signal here.
- **Why it matters:** month-1 retention (21.1% average) understates a
  value-holding base that interacts rarely; cohort results are engagement, not
  deposits.
- **Mitigation:** the definition is stated in `kpi_framework.md` (KPI-02) and
  `methodology.md`; real deposit-value retention requires R-3.

## 8. Cost figures use a daily price reference, and the ratio is meaningless

- **What:** `gas_cost_usd` applies the daily CoinGecko POL/USD price (100%
  coverage in window). The "gas as % of value" measure divides gas by native
  value, which is degenerate; the value×gas correlation (r = −0.05, p = 0.78)
  is reported as non-meaningful.
- **Why it matters:** absolute cost (~$0.0073/tx, ~$1,158 total) is reliable;
  any ratio or correlation that depends on native value is not.
- **Mitigation:** the report says this explicitly (Finding 3.4) and recommends
  re-measuring fee economics at function level after R-3.

## 9. Data-quality constraints from the V2 API

- **What:** `token_transfers.transfer_id` is a surrogate (`tx_hash + "_" + seq`)
  because the V2 API omits `logIndex`; `tokentx` parent transactions are not
  in the Pool ledger; addresses are normalized to lowercase without
  case-checksum validation.
- **Why it matters:** minor join/audit friction, no impact on counts.
- **Mitigation:** documented in `data_dictionary.md`; referential integrity is
  verified on load (0 orphans).

## 10. Environment and reproducibility dependencies

- **What:** the local PostgreSQL server runs in WSL2 and requires `jit=off`
  (missing LLVM runtime); the Power BI extract `fact_transactions.csv` is
  large and gitignored; the `.pbix` is gitignored.
- **Why it matters:** full reproduction needs a reachable PostgreSQL instance
  and the local Power BI files; the GitHub repo carries code + small extracts
  + screenshots, not the raw data or the workbook.
- **Mitigation:** `methodology.md` §6 gives the exact run order; the dashboard
  can be rebuilt from the committed small extracts in `dashboard/data_extracts/`
  following `dashboard/build_spec.md`.

## 11. No off-chain context

- **What:** price feeds are market references, not user-reported intent; no
  marketing/financial events, support tickets, or survey data are available to
  explain *why* activity moved (e.g., the April 8–14 spike is inferred to be a
  promotional/airdrop event from on-chain timing alone).
- **Why it matters:** causal explanations in the reports are hypotheses, not
  verified business events.
- **Mitigation:** the findings that rest on inference are labeled Medium
  confidence and competing explanations are noted (e.g., bot activity in
  Finding 3.5).

---

**Net effect:** the engagement-side numbers (activity, retention, segments,
concentration) are reliable and computed directly from clean ledger data. The
**value-side numbers are structurally unable to answer monetary questions at
Pool level** and are treated accordingly — fixing this is the single highest
data priority in the recommendations (R-3).