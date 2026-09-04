# KPI Framework

Scope: the 7 KPIs tracked in the final dashboard. For each: definition,
formula / calculation logic, the business question it answers, and the target
SQL table/column it is computed from (schema built in Part 3; see
`data_dictionary.md`).

Reference tables: `transactions`, `wallets`, `token_transfers`, `contracts`.

---

## KPI-01 — Active Wallets (Daily / Monthly)

- **Calculation:** `COUNT(DISTINCT wallet_address)` where the wallet appears as
  `from_wallet` or `to_wallet` in `transactions` within the period
  (calendar day / calendar month).
- **Business question:** How many distinct users are actually using the
  protocol, and is that base growing?
- **Source:** `transactions.from_wallet`, `transactions.to_wallet`,
  `transactions.timestamp`. Summary column: `wallets.total_transactions`.

## KPI-02 — Retention Rate by Cohort

- **Calculation:** For each cohort (month of first activity) and each
  subsequent month n, `(wallets in cohort active in month n) / (wallets in
  cohort)`. Headline stat: average Month-1 retention across all cohorts.
- **Business question:** Do users who try the protocol come back, and is
  retention improving for newer cohorts?
- **Source:** `wallets.first_seen_date`, `transactions.timestamp`,
  `wallets.last_seen_date`.

## KPI-03 — Average Transaction Value

- **Calculation:** `SUM(transactions.value_native) / COUNT(transactions.tx_hash)`.
- **Business question:** What is the typical economic size of an interaction,
  and is transaction value per interaction rising or falling over time?
- **Source:** `transactions.value_native`.

## KPI-04 — Gas Cost as % of Transaction Value

- **Calculation:** `SUM(transactions.gas_cost_native) / SUM(transactions.value_native) * 100`,
  computed over the reporting period. `gas_cost_native = gas_used * gas_price`
  (native token units; USD if a price reference is available, else documented
  as a limitation).
- **Business question:** How much of the value users transact is consumed by
  network costs — i.e. how "expensive" is the protocol to use?
- **Source:** `transactions.gas_cost_native`, `transactions.value_native`.

## KPI-05 — Whale Concentration %

- **Calculation:** `volume from top 1% of wallets by total volume / total volume * 100`.
  Top-1% cutoff computed over the reporting window (PERCENTILE-based rank of
  `wallets.total_volume`).
- **Business question:** Is volume dangerously concentrated in a few wallets
  (dependency risk) or broadly distributed?
- **Source:** `wallets.total_volume`, `transactions.value_native`,
  whale flag on `transactions.is_whale_transaction`.

## KPI-06 — New vs Returning Wallet Ratio

- **Calculation:** Per month, `COUNT(new wallets in month) / COUNT(wallets active
  in month that had prior activity)`. A wallet is "new" in the month matching
  `wallets.first_seen_date`.
- **Business question:** Is growth being driven by genuinely new users or by
  re-engagement of existing users? A ratio falling over time suggests a
  saturated or shrinking acquisition funnel.
- **Source:** `wallets.first_seen_date`, `wallets.last_seen_date`,
  `transactions.timestamp`.

## KPI-07 — Median Transaction Value

- **Calculation:** `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value_native)`
  over `transactions` for the reporting period.
- **Business question:** What does the "typical" user actually transact, once
  whale activity is stripped out? Median is the whale-robust counterpart to
  KPI-03 (mean) — a large gap between the two quantifies how distorted the
  mean is by concentration.
- **Source:** `transactions.value_native`.

---

## KPI → requirement traceability

| KPI | Requirement |
|---|---|
| KPI-01 Active Wallets | BR-01, BR-06 |
| KPI-02 Retention Rate | BR-02, BR-05 |
| KPI-03 Avg Transaction Value | BR-03 |
| KPI-04 Gas Cost % of Value | BR-03 |
| KPI-05 Whale Concentration % | BR-04, BR-05, BR-07 |
| KPI-06 New vs Returning Ratio | BR-01 |
| KPI-07 Median Transaction Value | BR-03, BR-07 |

Every requirement in `business_requirements.md` maps to at least one KPI, and
every KPI maps back to at least one requirement.