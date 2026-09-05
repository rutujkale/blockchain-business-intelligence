-- =====================================================================
-- Q3 - Whale transactions: the top 0.5% by economic value
-- Combined value = native POL value, else max single token-transfer
-- amount inside the tx (whale definition, see cleaning log).
-- =====================================================================
WITH whale_vals AS (
    SELECT
        t.tx_hash,
        t.block_number,
        t.timestamp,
        t.value_native,
        t.gas_cost_usd,
        w.wallet_address                      AS sender,
        COALESCE(x.max_transfer_amount, 0)     AS max_token_transfer,
        GREATEST(t.value_native,
                 COALESCE(x.max_transfer_amount, 0)) AS economic_value
    FROM transactions t
    JOIN wallets w                 ON w.wallet_address = t.from_wallet
    LEFT JOIN (
        SELECT tx_hash, MAX(amount) AS max_transfer_amount
        FROM token_transfers
        GROUP BY tx_hash
    ) x ON x.tx_hash = t.tx_hash
    WHERE t.is_whale_transaction
)
SELECT
    ROW_NUMBER() OVER (ORDER BY economic_value DESC) AS rank,
    tx_hash,
    sender,
    timestamp,
    value_native,
    max_token_transfer,
    economic_value,
    gas_cost_usd
FROM whale_vals
ORDER BY rank;