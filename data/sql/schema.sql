-- =====================================================================
-- Blockchain Business Intelligence - Part 3 schema
-- Aave V3 Pool (Polygon PoS) transaction analytics warehouse
-- PostgreSQL 16
-- =====================================================================

-- ---------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    wallet_address     VARCHAR(42) PRIMARY KEY,
    first_seen_date    DATE,
    last_seen_date     DATE,
    total_transactions BIGINT,
    total_volume       NUMERIC(38, 18),
    wallet_segment     VARCHAR(32),
    is_contract        BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
    contract_address VARCHAR(42) PRIMARY KEY,
    name             VARCHAR(128),
    category         VARCHAR(32),
    verified         BOOLEAN NOT NULL DEFAULT FALSE,
    creation_date    DATE
);

-- ---------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    tx_hash              VARCHAR(66) PRIMARY KEY,
    from_wallet          VARCHAR(42) REFERENCES wallets(wallet_address),
    to_wallet            VARCHAR(42) REFERENCES wallets(wallet_address),
    timestamp            TIMESTAMPTZ,
    value_native         NUMERIC(38, 18),
    gas_used             BIGINT,
    gas_price            NUMERIC(38, 0),
    gas_cost_native      NUMERIC(38, 18),
    gas_cost_usd         NUMERIC(38, 18),
    status               SMALLINT,
    is_whale_transaction BOOLEAN NOT NULL DEFAULT FALSE,
    block_number         BIGINT
);

-- ---------------------------------------------------------------------
-- token_transfers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_transfers (
    transfer_id    VARCHAR(90) PRIMARY KEY,
    tx_hash        VARCHAR(66),
    token_contract VARCHAR(42) REFERENCES contracts(contract_address),
    from_wallet    VARCHAR(42) REFERENCES wallets(wallet_address),
    to_wallet      VARCHAR(42) REFERENCES wallets(wallet_address),
    amount         NUMERIC(38, 18),
    token_symbol   VARCHAR(96),
    is_spam        BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Indexes on foreign keys and timestamp columns (tables are queried by
-- date range constantly)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp   ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_from        ON transactions(from_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_to          ON transactions(to_wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_whale       ON transactions(is_whale_transaction);

CREATE INDEX IF NOT EXISTS idx_token_transfers_timestamp     ON token_transfers(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_transfers_tx_hash       ON token_transfers(tx_hash);
CREATE INDEX IF NOT EXISTS idx_token_transfers_token_contract ON token_transfers(token_contract);
CREATE INDEX IF NOT EXISTS idx_token_transfers_from          ON token_transfers(from_wallet);
CREATE INDEX IF NOT EXISTS idx_token_transfers_to            ON token_transfers(to_wallet);

CREATE INDEX IF NOT EXISTS idx_wallets_first_seen      ON wallets(first_seen_date);
CREATE INDEX IF NOT EXISTS idx_wallets_last_seen       ON wallets(last_seen_date);
CREATE INDEX IF NOT EXISTS idx_contracts_category      ON contracts(category);

-- ---------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------
COMMENT ON TABLE wallets IS 'Unique wallet addresses seen in the pool activity (from/to on transactions and token transfers)';
COMMENT ON COLUMN wallets.total_volume IS 'Sum of native value (POL) received by the wallet across transactions in the pull window; aToken-denominated Aave volume is not captured at the Pool level (see limitations)';
COMMENT ON COLUMN wallets.wallet_segment IS 'Filled in Part 5 customer intelligence (retail/institutional/whale/contract)';

COMMENT ON TABLE transactions IS 'Executions against the Aave V3 Pool contract';
COMMENT ON COLUMN transactions.value_native IS 'Native POL value attached to the call (near zero for Aave - funds move as ERC-20 aTokens)';
COMMENT ON COLUMN transactions.is_whale_transaction IS 'Top 0.5% by combined economic value (native value else max per-tx token transfer amount)';

COMMENT ON TABLE contracts IS 'Known/verified contracts appearing in pool activity, with on-chain creation date';
COMMENT ON COLUMN contracts.verified IS 'Source-verified on PolygonScan (empty name means unverified - used to flag spam tokens)';

COMMENT ON TABLE token_transfers IS 'ERC-20 transfers touching the pool in the pull window; transfer_id is a surrogate (V2 API exposes no logIndex)';
COMMENT ON COLUMN token_transfers.tx_hash IS 'Parent tx of the transfer. Not an FK: these transfers fire inside txs targeting token/spam contracts, which are outside the pool-ledger pull, so the parent tx is not necessarily stored';
COMMENT ON COLUMN token_transfers.is_spam IS 'True when the token contract is not source-verified (most spam airdrops)';