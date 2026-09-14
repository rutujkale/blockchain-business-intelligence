---
title: "Aave V3 Pool on Polygon — Executive Summary"
subtitle: "Blockchain Business Intelligence · 2026-03-09 → 2026-09-05"
author: "Prepared for Executive / Product / Finance / Operations / Risk review"
margin: 1.5cm
fontsize: 10pt
---

## Executive Summary

This analysis covers every on-chain interaction with the Aave V3 Pool contract on Polygon (`0x794a…4814ad`) over six months: 18,981 wallets and 158,916 transactions. The headline is not growth — it is a spike and a decay. Active wallets peaked at **12,407 in April**, then fell **−94%** to a partial 716 in September; a seven-day moving average confirms a structural downtrend. What remains is thin but maturing: the **top 1% of wallets (~190) drive ~49% of all transactions**, and new-wallet share fell from 100% (March) to ~21% (September) as a small retained core came to dominate the base.

Two measurement facts shape every decision. First, **value is degenerate at the Pool level** — the Pool contract absorbs ~100% of received native POL (positions move as ERC-20 aTokens), so monetary KPIs read near zero and must be rebuilt from function-level deposits, not Pool-level volume. Second, **cost is trivial** — ~$0.0073 per transaction (~$1,158 total) — so the economics problem is measurement, not cost.

**Implication:** treated as a durable user base, the protocol is small and at risk. Prioritize retaining the committed core and fixing value measurement before any acquisition spend; formalize the concentration and automation risk represented by a handful of power wallets.

## Key Findings

- **Activity collapse (High).** MAU fell −94% from the April peak (12,407 → 716 partial Sep); 7-day MA confirms a structural downtrend, not seasonality.
- **Thin, maturing core (High).** 79.5% of senders transacted only once, yet new-wallet share fell 100% → ~21% — a small retained base now dominates.
- **Concentration + degenerate value (Medium).** Top 1% (~190 wallets) ≈ 49% of txs; ~100% of native value sits in the Pool contract (median tx value = 0 POL).
- **Negligible cost (High).** ~$0.0073/tx (~$1,158 total); the gas-as-%-of-value ratio and value×gas correlation (r = −0.05, p = 0.75) are noise.
- **Bot-like timing (Medium).** Activity clusters at 12:00 UTC Thursdays, near-zero weekends — consistent with orchestrated/automated usage.
- **Poor retention (High).** Average month-1 retention 21.1%; the April cohort (58% of the base) retained 4.7%, the March cohort 47%.

## Recommendations

| # | Recommendation | Priority | Owner | Next step |
|---|---|---|---|---|
| R-1 | Attack the month-1 retention cliff (21.1% → target 30%) | High | Product Manager | 30-day onboarding + reactivation campaign over New/Emerging (714) and High-Value Dormant + Frequent (6,257) |
| R-2 | Formalize concentration/dependency risk | High | Operations | Add top-1% share trend to dashboard; alert if >60% in any 7-day window; key-account list from `dim_wallets` |
| R-3 | Fix value-measurement gap | High | Finance | Decode deposit/borrow/withdraw at function level; load real-time POL-USD + aToken prices; recompute monetary KPIs |
| R-4 | Reframe growth around a durable-base KPI | Medium | Executive | Add "retained core (active ≥2 of last 3 months)" card next to MAU on Page 1 |
| R-5 | Keep Polygon; re-measure economics after R-3 | Low | Finance | Enforce gas ≤ 0.5% of transferred value by function once R-3 lands |
| R-6 | Build explicit bot/anomaly detection | High | Risk/Compliance | Flag wallets with ≥90% of activity in the peak hour-day cluster; alert on per-wallet rate spikes |

*Full analysis, methodology, limitations, and evidence backings: `outputs/reports/business_recommendations.md`.*