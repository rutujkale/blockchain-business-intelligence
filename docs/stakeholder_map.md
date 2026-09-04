# Stakeholder Map

Scope: On-chain activity for the target DeFi protocol on Polygon. Data is
drawn from public blockchain transaction and token transfer records via the
Polygonscan API (6-month window).

| Stakeholder Role | Primary Question They'd Ask | What Metric Answers It | Data Source |
|---|---|---|---|
| Executive / Leadership | Is the protocol's user base and economic activity growing month over month, and are we building a durable franchise or a spike? | Monthly Active Wallets (MAU), Transaction Count and Total Volume trends, New vs Returning Wallet Ratio | `transactions`, `wallets` |
| Product Manager | Are we retaining high-value users, or do power users churn after the first engagement? | Cohort Retention Rate (Month-1 retention, per cohort), segment-level retention | `wallets`, `transactions` |
| Finance | What does it cost users to interact with the protocol, and is that cost eroding the value they capture? | Gas Cost as % of Transaction Value, Average Transaction Value, total gas cost trend | `transactions` |
| Operations | Is volume concentrated in a handful of wallets (whales) that create dependency risk, or is it broadly distributed? | Whale Concentration (% of total volume from top 1% wallets), segment volume split | `transactions`, `wallets` |
| Risk / Compliance | Are there anomalous activity patterns (surge wallets, unusual timing, outlier transaction sizes) that signal abuse or market-impacting behavior? | Anomaly / whale transaction counts, outlier flags, activity-by-time distributions | `transactions`, `token_transfers` |

## Notes for readers

- A single wallet address is not assumed to equal a single human user; wallet
  address is used as the analysis unit and this limitation is documented
  explicitly in the final report.
- All metric definitions live in `kpi_framework.md`; all KPI→table mappings
  reference the schema defined in `data_dictionary.md` (built in Part 3).