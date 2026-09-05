-- =====================================================================
-- Q2 - Function call mix on the Aave V3 Pool
-- Requires the decoded function_name column (added as a derived field in
-- Part 2 extraction) - uncomment the LEFT JOIN to decode when available.
-- =====================================================================
SELECT
    CASE
        WHEN from_wallet = to_wallet THEN 'self'
        WHEN status = 0             THEN 'failed'
        WHEN is_whale_transaction   THEN 'whale'
        ELSE 'normal'
    END AS behavior,
    COUNT(*) AS tx_count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_of_total,
    ROUND(SUM(gas_cost_usd)::numeric, 2) AS gas_cost_usd
FROM transactions
GROUP BY 1
ORDER BY tx_count DESC;