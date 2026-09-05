-- =====================================================================
-- Q1 - Daily activity profile of the Aave V3 Pool
-- Daily tx count, total gas (native + USD), unique interacting wallets.
-- Backbone of the Power BI "activity over time" panel.
-- =====================================================================
SELECT
    DATE_TRUNC('day', timestamp)::date                        AS day,
    COUNT(*)                                                  AS tx_count,
    COUNT(*) FILTER (WHERE status = 0)                        AS failed_count,
    ROUND(SUM(gas_cost_native)::numeric, 4)                   AS gas_cost_pol,
    ROUND(SUM(gas_cost_usd)::numeric, 4)                      AS gas_cost_usd,
    COUNT(DISTINCT from_wallet)                               AS unique_senders
FROM transactions
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY day;