# Data Dictionary

Final relational schema for the Aave V3 Pool (Polygon PoS) analytics
warehouse, loaded by `src/transformation/load_to_postgres.py` into PostgreSQL
16 (database `blockchain_bi`). Source of truth: `data/sql/schema.sql`.

Scope: 6 months of on-chain activity (2026-03-09 to 2026-09-05) fetched from
the Etherscan V2 API. `transactions` models executions against the **Pool
contract** (`0x794a61358D6845594F94dc1DB02A252b5b4814aD`); `token_transfers`
models ERC-20 transfers that touch the Pool but fire inside txs targeting
other (mostly spam) token contracts.

---

## 1. `wallets`

Every unique address seen on the `from` or `to` side of either a Pool-facing
transaction or a Pool-touching token transfer.

| Column              | Type            | Description |
|---------------------|-----------------|-------------|
| `wallet_address`    | VARCHAR(42) PK  | EOA or contract address, lowercase. |
| `first_seen_date`   | DATE            | First day the wallet appears in the pull window. |
| `last_seen_date`    | DATE            | Last day the wallet appears in the pull window. |
| `total_transactions`| BIGINT          | Pool-facing txs where the wallet is `from` or `to` (transfers are counted via their own rows). |
| `total_volume`      | NUMERIC(38,18)  | Sum of native POL received in the pull window. Near zero for Aave users because value moves as aTokens/ERC-20 (see limitations). |
| `wallet_segment`    | VARCHAR(32)     | Reserved for Part 5 customer-intelligence segmentation; NULL until then. |
| `is_contract`       | BOOLEAN         | TRUE when the address resolves to a contract (seed + token spam 0x0..0268 style addresses). |

**Derivation:** union of `from`/`to` from `transactions` and `token_transfers`;
`first/last_seen` and `total_transactions/volume` computed per wallet.

---

## 2. `transactions`

One row per execution against the Aave V3 Pool contract (deduplicated on
`tx_hash`). Failed, self and zero-value transactions are flagged, never
dropped.

| Column                   | Type            | Description |
|--------------------------|-----------------|-------------|
| `tx_hash`                | VARCHAR(66) PK  | Transaction hash, lowercase. |
| `from_wallet`            | VARCHAR(42) FK  | `wallets.wallet_address` of the sender. |
| `to_wallet`              | VARCHAR(42) FK  | `wallets.wallet_address` of the recipient (the Pool for normal calls). |
| `timestamp`              | TIMESTAMPTZ     | Block time in UTC. |
| `value_native`           | NUMERIC(38,18)  | Attached native POL value (deduced from wei, 18 decimals). Near zero for Aave calls. |
| `gas_used`               | BIGINT          | Gas units consumed. |
| `gas_price`              | NUMERIC(38,0)   | Effective gas price in wei. |
| `gas_cost_native`        | NUMERIC(38,18)  | `gas_used * gas_price` in POL. |
| `gas_cost_usd`           | NUMERIC(38,18)  | Gas cost in USD at daily CoinGecko POL/USD reference (100% coverage in window). |
| `status`                 | SMALLINT        | Receipt status: 1 success, 0 failed. |
| `is_whale_transaction`   | BOOLEAN         | TRUE for the top 0.5% by combined economic value (native value else max per-tx token-transfer amount). |
| `block_number`           | BIGINT          | Polygon block that mined the tx. |

**Indexes:** `timestamp`, `from_wallet`, `to_wallet`, `is_whale_transaction`.

---

## 3. `token_transfers`

ERC-20 transfer events where the Pool is the `from` or `to` side, in the pull
window. Pulled separately from the transaction stream, so the parent tx lives
outside the Pool-facing ledger (it targets the token/spam contract itself).

| Column           | Type            | Description |
|------------------|-----------------|-------------|
| `transfer_id`    | VARCHAR(90) PK  | Surrogate `tx_hash + "_" + seq` (V2 API exposes no stable logIndex). |
| `tx_hash`        | VARCHAR(66)     | Parent tx hash. Not an FK - parent may be outside the Pool ledger (see table comment). |
| `token_contract` | VARCHAR(42) FK  | `contracts.contract_address` of the ERC-20 that emitted the event. |
| `from_wallet`    | VARCHAR(42) FK  | Sender side of the transfer. |
| `to_wallet`      | VARCHAR(42) FK  | Receiver side of the transfer (the Pool for deposit flows). |
| `amount`         | NUMERIC(38,18)  | Human-readable amount (wei / 10^decimals). |
| `token_symbol`   | VARCHAR(96)     | Symbol as reported by the API (spam tokens embed ad text here). |
| `is_spam`        | BOOLEAN         | TRUE when the token contract is not source-verified (156 of 163 rows are spam bait). |
| `timestamp`      | TIMESTAMPTZ     | Block time in UTC. |

**Indexes:** `timestamp`, `token_contract`, `from_wallet`, `to_wallet`.

---

## 4. `contracts`

Contracts that appear as counterparts in pool activity, plus the seed &
known-contract reference set from Part 1.

| Column              | Type           | Description |
|---------------------|----------------|-------------|
| `contract_address`  | VARCHAR(42) PK | Contract address, lowercase. |
| `name`              | VARCHAR(128)   | Name when source-verified; NULL for the added unverified spam tokens. |
| `category`          | VARCHAR(32)    | Lending / Token / DEX / NFT / etc. Unverified added tokens are `Token`. |
| `verified`          | BOOLEAN        | TRUE when source-verified on PolygonScan. |
| `creation_date`     | DATE           | On-chain creation date (proxy `eth_getTransactionByHash` + block timestamp). |

**Note:** 140 unverified spam-token contracts were auto-added during load so
the `token_transfers.token_contract` FK resolves; the 19 curated rows carry
`name`/`category`/`creation_date`.

---

## Cross-table relationships

```
wallets (PK wallet_address)
   ^
   | from_wallet / to_wallet
transactions (PK tx_hash)          ---- (tx_hash, no FK) token_transfers
contracts  (PK contract_address) <- token_transfers.token_contract (FK)
```

- `transactions.from_wallet` / `transactions.to_wallet` -> `wallets`
- `token_transfers.from_wallet`/`to_wallet` -> `wallets`
- `token_transfers.token_contract` -> `contracts`
- `token_transfers.tx_hash` intentionally **not** an FK (parent tx targets
  token/spam contracts outside the Pool ledger)

Referential integrity check in the loader reports 0 orphans on every FK.

## Raw sidecar files (not loaded into the warehouse)

| File | Description |
|------|-------------|
| `data/raw/transactions_raw.csv` | Raw V2 API tx payloads (158,916 rows, wei / unix). |
| `data/raw/token_transfers_raw.csv` | Raw tokentx payloads (163 rows). |
| `data/raw/contracts_metadata.csv` | Curated contract metadata with `creation_date`. |
| `data/raw/pol_usd_daily.csv` | Daily POL/USD reference from CoinGecko (365 days). |
| `data/processed/transactions_clean.csv` | Cleaned transactions (the loaded file). |
| `data/processed/token_transfers_clean.csv` | Cleaned transfers. |
| `data/processed/flagged_transactions.csv` | Rows flagged failed/self/zero-value. |
| `data/processed/cleaning_log.json` | Step metrics + whale cutoff + notes. |

## Known limitations (documented, not silently hidden)

1. **Volume signal is native-biased.** Aave moves funds as ERC-20/aTokens; only
   38 of 158,916 txs carry native value, so `total_volume` and the whale flag
   understate real economic activity. Whale = top 0.5% of *combined* value but
   yields only 1 row (a 1,000 POL supply) **by design** - see Part 4/5 for a
   function-level breakdown instead.
2. **Token-transfer parent txs are not in the ledger** - ERC-20 events touching
   the Pool fire inside txs to token contracts, so they legitimately have no
   `transactions` row (schema comment + README explain this).
3. **`transfer_id` is a surrogate** because the V2 API omits `logIndex`.
4. **Wallet segmentation (`wallet_segment`) is NULL until Part 5.**