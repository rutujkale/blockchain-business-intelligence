-- =====================================================================
-- Q4 - Top interacting wallets (activity + volume)
-- Feeds Part 5 customer intelligence and the leaderboard panel.
-- NOTE: total_volume for Aave wallets is ~0 because value moves as
-- ERC-20/aTokens, not native POL (documented limitation). Use this view
-- mainly for activity/frequency segmentation.
-- =====================================================================
SELECT
    w.wallet_address,
    w.total_transactions,
    w.first_seen_date,
    w.last_seen_date,
    w.is_contract,
    ROUND(w.total_volume::numeric, 4)     AS native_volume_pol,
    COUNT(t.tx_hash) FILTER (WHERE t.status = 0) AS failed_txs,
    COUNT(t.tx_hash) FILTER (WHERE t.is_whale_transaction) AS whale_txs
FROM wallets w
LEFT JOIN transactions t ON t.from_wallet = w.wallet_address
GROUP BY w.wallet_address, w.total_transactions, w.first_seen_date,
         w.last_seen_date, w.is_contract, w.total_volume
ORDER BY w.total_transactions DESC
LIMIT 100;