-- =====================================================================
-- Q5 - Time-of-day and day-of-week usage pattern
-- Companion aggregate to q1 for the dashboard's clock/heatmap visuals.
-- hour/day_of_week are stored columns carried over from cleaning.
-- =====================================================================
WITH hourly AS (
    SELECT
        EXTRACT(HOUR FROM timestamp)  AS hour_of_day,
        EXTRACT(DOW  FROM timestamp)  AS day_of_week,  -- 0=Sunday ..
        COUNT(*)                      AS tx_count,
        ROUND(SUM(gas_cost_usd)::numeric, 2) AS gas_cost_usd
    FROM transactions
    GROUP BY 1, 2
)
SELECT *
FROM hourly
ORDER BY tx_count DESC;