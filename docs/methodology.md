# Methodology

Full "show your work" for the Blockchain Business Intelligence project: how the
Aave V3 Pool dataset was acquired, cleaned, stored, and analyzed, and how every
number in the reports was produced. This is verification material — every step
maps to a script in `src/` and every analysis maps to an artifact under
`data/`, `outputs/`, or `dashboard/`.

## 1. Overview

The project treats a DeFi protocol as a business. The subject is the **Aave
V3 Pool** contract on **Polygon PoS** (`0x794a61358D6845594F94dc1DB02A252b5b4814aD`,
chainid 137) over the window **2026-03-09 → 2026-09-05** (~181 days): 18,981
wallets, 158,916 transactions, 159 contracts, 163 token transfers.

Pipeline: **API extraction → raw CSV → cleaning/transformation → PostgreSQL 16
warehouse (`blockchain_bi`) → analysis (EDA, RFM, cohorts) → Power BI dashboard
→ recommendations report.**

## 2. Data sourcing & acquisition

| Step | Script | Output |
|---|---|---|
| Core ledger + token transfers | `src/extraction/fetch_transactions.py` | `data/raw/transactions_raw.csv` (158,916 rows), `data/raw/token_transfers_raw.csv` (163 rows), `data/raw/extraction_log.json` |
| Contract metadata | `src/extraction/fetch_contract_metadata.py` | `data/raw/contracts_metadata.csv` (verified contracts + top tickers) |
| POL/USD reference | inside `clean_transactions.py` | `data/raw/pol_usd_daily.csv` (CoinGecko, 365 days, cached) |

**API:** Etherscan V2 unified API (`https://api.etherscan.io/v2/api`), key in
`.env`, with `chainid=137`. Two endpoints are used: `txlist` (transactions
executed against the Pool contract) and `tokentx` (ERC-20 transfer events where
the Pool is a counterparty).

**Token-transfer nuance:** a transfer's *parent transaction* targets the token
contract, not the Pool, so `token_transfers` rows have no matching row in
`transactions` and are modeled as their own table (see `data_dictionary.md`).

**Extraction strategy** (resumable and rate-limit-safe):
- block-chunked pulls of 172,800 blocks (~4 days on Polygon); pages of 1,000
  rows capped at 10,000 per result window;
- 0.11 s sleep between calls, exponential backoff on network errors, up to 5
  retries, explicit `429` handling, "No transactions found" short-circuit;
- already-fetched block ranges are skipped on re-run, so a failed run can be
  restarted in place; `extraction_log.json` records requested vs actual
  date range and row counts.

## 3. Cleaning & transformation

`src/transformation/clean_transactions.py` normalizes raw API payloads into
analysis-ready CSVs:

- **Normalization:** lowercase addresses; wei → decimal (18 decimals) for value
  and gas; unix timestamps → UTC datetimes; dedupe on `tx_hash`.
- **Flags, never drops:** failed receipts (`status = 0`), self-transfers, and
  zero-value transactions are *flagged* in
  `data/processed/flagged_transactions.csv`, never deleted — so RAW activity
  counts always reconcile to the ledger and anomalies stay auditable.
- **Spam filtering:** token transfers whose contract is not source-verified are
  marked `is_spam = TRUE` (156 of 163 rows are unverified spam bait). Spam
  rows are excluded from the RFM monetary fallback and from retention
  activity, but retained in the table for completeness.
- **Gas → USD:** `gas_cost_native = gas_used × gas_price` (POL); `gas_cost_usd`
  applies the daily CoinGecko POL/USD reference with 100% coverage in the
  window.
- **Whale flag:** `is_whale_transaction = TRUE` for the top 0.5% of
  transactions by *combined economic value*, defined as native value when
  non-zero, falling back to the largest non-spam token-transfer amount on that
  tx. Because native value is degenerate for this contract, the flag yields **1
  row by design** (a 1,000 POL `supply`).

**Outputs:** `transactions_clean.csv`, `token_transfers_clean.csv`,
`flagged_transactions.csv`, `cleaning_log.json` (step metrics, whale cutoff,
decisions). `data/processed/` is gitignored.

## 4. Warehouse model

`src/transformation/load_to_postgres.py` + `data/sql/schema.sql` build the
PostgreSQL 16 database `blockchain_bi`:

- **`wallets`** (18,981) — one row per unique address: `first_seen_date`,
  `last_seen_date`, `total_transactions`, `total_volume` (native POL), and
  `wallet_segment` (populated in Part 5).
- **`transactions`** (158,916) — one row per execution against the Pool,
  PK `tx_hash`: from/to wallet FKs, `timestamp`, `value_native`,
  `gas_used/gas_price/gas_cost_native/gas_cost_usd`, `status`,
  `is_whale_transaction`.
- **`contracts`** (159) — counterpart contracts: `name`, `category`,
  `verified`, `creation_date` (19 curated rows + 140 unverified spam tokens
  auto-added so the transfer FK resolves).
- **`token_transfers`** (163) — ERC-20 events touching the Pool; surrogate PK
  `tx_hash+"_"+seq` because the V2 API exposes no stable `logIndex`.

Referential integrity is checked on load (0 orphans on every FK).

> **Environment note (JIT):** the local PostgreSQL server runs in WSL2 without
> the LLVM runtime, so complex analytical queries fail with
> `could not load library .../llvmjit.so` unless JIT is off. Every analysis
> script therefore connects with `connect_args={"options": "-c jit=off"}`. This
> is an environment quirk, not a pipeline requirement; the SQL itself is
> plain PostgreSQL.

## 5. Analysis methods

### 5.1 Exploratory analysis (Part 4)

`src/analysis/build_eda_notebook.py` generates `notebooks/01_eda.ipynb`
(executed headlessly with `nbconvert`) — 5 sections of window/CTE SQL against
the warehouse, ~11 charts into `outputs/figures/` (150 dpi), and a Key Findings
cell. Methods used:

- **Activity:** date-bucketed `COUNT(DISTINCT wallet)` over `from_wallet` +
  `to_wallet`; monthly active wallets, 7-day moving averages, new-vs-returning
  monthly mix (first-seen classification).
- **Distribution:** per-wallet transaction-count distribution; **whale
  concentration** = top-1% of user wallets' share of transaction count
  (48.7%, ≈190 wallets).
- **Statistics:** Pearson product-moment correlation between native value and
  gas cost on the 38 value-carrying transactions (r = −0.054, p = 0.748) —
  reported as non-meaningful, not as a relationship.
- **Time patterns:** hour-of-day × weekday heatmap; peak-hour/peak-day
  identification (12:00 UTC Thursday; peak day 2026-04-10, 4,874 txs).

### 5.2 RFM segmentation (Part 5A)

`src/analysis/rfm_segmentation.py` scores every wallet 1–5 per dimension using
SQL `NTILE(5)`:

| Dimension | Definition | Ordering |
|---|---|---|
| **Recency (R)** | days since the wallet's last on-chain activity (tx from/to + token transfers) relative to the dataset max timestamp | ascending recency → **bucket 5 = most recent** |
| **Frequency (F)** | `wallets.total_transactions` | ascending count → **bucket 5 = most frequent** |
| **Monetary (M)** | `COALESCE(NULLIF(total_volume, 0), max non-spam token-transfer amount, 0)` | ascending → **bucket 5 = most valuable** |

Segment mapping is a single mutually exclusive `CASE WHEN` (fallback:
Occasional Users), so every wallet gets exactly one segment:

| Segment | Rule |
|---|---|
| High-Value Active | R ≥ 4 AND F ≥ 4 AND M ≥ 4 |
| High-Value Dormant | R ≤ 2 AND M ≥ 4 |
| Frequent Users | F ≥ 4 AND M < 4 |
| Emerging Users | R ≥ 4 AND F ≤ 2 AND M ≤ 2 AND first seen ≤ 60 days ago |
| Occasional Users | F ∈ 2..3 AND M ∈ 2..3 |
| Dormant Users | R ≤ 2 AND F ≤ 2 AND M ≤ 2 |
| New Users | first seen ≤ 30 days ago AND F ≤ 1 |
| *(else)* Occasional Users | — |

The M dimension is **degenerate** for this pull (18,974 of 18,981 wallets tie
at $0 native value; the Contract holds ×≈100% of received POL), so in practice
segments are driven by R × F — which are real and informative. The mapping and
the degeneracy are documented, not hidden. Results are written back to
`wallets.wallet_segment` and summarized to
`data/processed/segment_summary.csv`.

### 5.3 Cohort retention (Part 5B)

`src/analysis/cohort_retention.py`:
- **Cohort** = calendar month of `wallets.first_seen_date`.
- **Active** = transaction `from` or `to` in the month, on `transactions` only
  (token transfers are excluded because 156/163 are unverified spam).
- **Retention(n)** = (wallets in cohort active in month *n*) / cohort size,
  for n = 0..6 as the window permits. Month offsets are calendar-month deltas.
- **"No data yet" semantics:** cells beyond the last observed month in the
  window are set to NaN (shown blank), so they are never confused with genuine
  0% retention.
- **Headline KPI:** average month-1 retention across all cohorts with data
  (**21.1%**).

### 5.4 Dashboard & DAX (Part 6)

`src/analysis/export_for_dashboard.py` pre-joins the warehouse into five flat
CSVs in `dashboard/data_extracts/` (`fact_transactions` — gitignored for size;
`dim_wallets`; `cohort_retention_matrix`; `rfm_segment_summary`;
`daily_kpi_summary`, zero-filled over 181 days) so Power BI can load without
heavy per-page aggregation. All DAX measures live in `dashboard/dax_measures.md`
(including MoM time intelligence and the Whale Tx Concentration % variants);
the exact download/page construction is `dashboard/build_spec.md`.

### 5.5 Reports (Part 7)

`outputs/reports/business_recommendations.md` synthesizes Parts 1–6 into
findings (each backed by a chart + query path) and recommendations mapped to
`business_requirements.md` and `stakeholder_map.md`. `executive_summary.pdf` is
reproducibly built from `executive_summary.md` by
`src/analysis/build_executive_summary_pdf.py` (pandoc → typst → 1-page PDF,
page count verified with pypdf).

## 6. Reproducibility — exact run order

Prereqs: PostgreSQL running (`blockchain_bi` created), `.env` with
`EXPLORER_API_KEY` and `DATABASE_URL`, venv installed (
`pip install -r requirements.txt`).

```powershell
# 1. Schema
psql -h 127.0.0.1 -U postgres -d blockchain_bi -f data/sql/schema.sql

# 2. Extraction (needs API key)
venv\Scripts\python.exe src\extraction\fetch_transactions.py
venv\Scripts\python.exe src\extraction\fetch_contract_metadata.py

# 3. Cleaning + load
venv\Scripts\python.exe src\transformation\clean_transactions.py
venv\Scripts\python.exe src\transformation\load_to_postgres.py        # --reset to rebuild

# 4. Analysis (needs the loaded DB)
venv\Scripts\python.exe src\analysis\build_eda_notebook.py
venv\Scripts\jupyter-nbconvert.exe --to notebook --execute --inplace notebooks\01_eda.ipynb
venv\Scripts\python.exe src\analysis\rfm_segmentation.py
venv\Scripts\python.exe src\analysis\cohort_retention.py
venv\Scripts\python.exe src\analysis\export_for_dashboard.py

# 5. Dashboard (Power BI Desktop, manual)
#    open dashboard/blockchain_bi_dashboard.pbix (imports dashboard/data_extracts/*.csv)

# 6. Report PDF (optional)
venv\Scripts\python.exe src\analysis\build_executive_summary_pdf.py
```

## 7. Artifact map

| Analysis | Primary artifacts |
|---|---|
| EDA (Part 4) | `notebooks/01_eda.ipynb`, `outputs/figures/*.png` (01–11) |
| RFM (Part 5A) | `wallets.wallet_segment`, `data/processed/segment_summary.csv` |
| Cohort (Part 5B) | `data/processed/cohort_retention.csv`, `outputs/figures/cohort_retention_heatmap.png` |
| Dashboard (Part 6) | `dashboard/data_extracts/*.csv`, `dashboard/dax_measures.md`, `dashboard/build_spec.md`, `dashboard/blockchain_bi_dashboard.pbix` (local) |
| Reports (Part 7) | `outputs/reports/business_recommendations.md`, `outputs/reports/executive_summary.{md,pdf}` |
| Working SQL | `data/sql/queries/q1…q5` (daily activity, behavior mix, whales, top wallets, time patterns) |