"""Export dashboard-ready extracts from the warehouse (Part 6).

Queries the blockchain_bi PostgreSQL warehouse and writes five flat,
pre-joined CSVs to dashboard/data_extracts/ so Power BI Desktop can import
them without heavy DAX aggregation on every page load:

  1. fact_transactions.csv         every tx denormalized with wallet segments,
                                   date parts and the whale flag pre-joined
  2. dim_wallets.csv               one row per wallet: segment, first/last
                                   seen, totals, recency + monetary units
  3. cohort_retention_matrix.csv   copied from Part 5 (data/processed)
  4. rfm_segment_summary.csv       copied from Part 5 (data/processed)
  5. daily_kpi_summary.csv         one row per date: active wallets, new
                                   wallets, tx count, volume, gas cost, whale
                                   tx count (pre-aggregated, zero-filled on
                                   inactive dates)

fact_transactions.csv is large (~75 MB) and is gitignored; the other four are
committed. Prints row counts and file sizes for each extract.

Usage:
    python src/analysis/export_for_dashboard.py
"""

import os
import shutil
from pathlib import Path

import pandas as pd
import sqlalchemy as sa
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
EXPORT_DIR = PROJECT_ROOT / "dashboard" / "data_extracts"

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set in .env")

# Disable query JIT: the local WSL2 PostgreSQL server is missing the LLVM
# runtime, so complex analytical queries fail with
# "could not load library .../llvmjit.so".
CONNECT_ARGS = {"options": "-c jit=off"}
engine = sa.create_engine(DATABASE_URL, connect_args=CONNECT_ARGS)

FACT_TRANSACTIONS_SQL = """
SELECT t.tx_hash,
       t.from_wallet,
       t.to_wallet,
       wf.wallet_segment AS from_segment,
       wt.wallet_segment AS to_segment,
       t.timestamp,
       t.timestamp::date AS event_date,
       EXTRACT(YEAR  FROM t.timestamp)::int AS year,
       EXTRACT(MONTH FROM t.timestamp)::int AS month,
       EXTRACT(DAY   FROM t.timestamp)::int AS day,
       EXTRACT(DOW   FROM t.timestamp)::int AS weekday,   -- 0 = Sunday
       EXTRACT(HOUR  FROM t.timestamp)::int AS hour_utc,
       t.value_native,
       t.gas_used,
       t.gas_price,
       t.gas_cost_native,
       t.gas_cost_usd,
       t.status,
       t.is_whale_transaction,
       t.block_number
FROM transactions t
LEFT JOIN wallets wf ON wf.wallet_address = t.from_wallet
LEFT JOIN wallets wt ON wt.wallet_address = t.to_wallet
ORDER BY t.timestamp, t.tx_hash;
"""

DIM_WALLETS_SQL = """
WITH activity AS (
    SELECT from_wallet AS wallet, timestamp AS ts FROM transactions
    UNION ALL SELECT to_wallet, timestamp FROM transactions
    UNION ALL SELECT from_wallet, timestamp FROM token_transfers
    UNION ALL SELECT to_wallet, timestamp FROM token_transfers
),
last_activity AS (
    SELECT wallet, MAX(ts) AS last_ts FROM activity GROUP BY wallet
),
non_spam_tokens AS (
    SELECT wallet, MAX(amount) AS max_amt FROM (
        SELECT from_wallet AS wallet, amount FROM token_transfers WHERE is_spam = FALSE
        UNION ALL
        SELECT to_wallet, amount FROM token_transfers WHERE is_spam = FALSE
    ) t
    GROUP BY wallet
),
dataset_max AS (
    SELECT MAX(ts) AS max_ts FROM (
        SELECT MAX(timestamp) AS ts FROM transactions
        UNION ALL SELECT MAX(timestamp) FROM token_transfers
    ) u
)
SELECT w.wallet_address,
       w.wallet_segment,
       w.is_contract,
       w.first_seen_date,
       w.last_seen_date,
       w.total_transactions,
       w.total_volume,
       COALESCE(NULLIF(w.total_volume, 0), nt.max_amt, 0) AS monetary_units,
       ROUND(EXTRACT(EPOCH FROM (d.max_ts - la.last_ts)) / 86400.0, 1) AS recency_days
FROM wallets w
LEFT JOIN last_activity la ON la.wallet = w.wallet_address
LEFT JOIN non_spam_tokens nt ON nt.wallet = w.wallet_address
CROSS JOIN dataset_max d
ORDER BY w.wallet_address;
"""

DAILY_KPI_SQL = """
WITH date_spine AS (
    SELECT generate_series(MIN(timestamp)::date, MAX(timestamp)::date, '1 day')::date AS event_date
    FROM transactions
),
daily AS (
    SELECT date_trunc('day', timestamp)::date AS event_date,
           COUNT(*) AS tx_count,
           COUNT(*) FILTER (WHERE status = 0) AS failed_tx_count,
           COUNT(*) FILTER (WHERE is_whale_transaction) AS whale_tx_count,
           ROUND(SUM(value_native), 6)  AS total_volume_pol,
           ROUND(SUM(gas_cost_usd), 2)  AS total_gas_usd,
           ROUND(SUM(gas_cost_native), 6) AS total_gas_native,
           COUNT(DISTINCT from_wallet) AS from_wallets,
           COUNT(DISTINCT to_wallet)   AS to_wallets
    FROM transactions
    GROUP BY 1
),
active_wallets AS (
    SELECT event_date, COUNT(DISTINCT wallet) AS active_wallets FROM (
        SELECT date_trunc('day', timestamp)::date AS event_date, from_wallet AS wallet FROM transactions
        UNION ALL
        SELECT date_trunc('day', timestamp)::date, to_wallet FROM transactions
    ) a
    GROUP BY event_date
),
new_wallets AS (
    SELECT first_seen_date AS event_date, COUNT(*) AS new_wallets
    FROM wallets
    GROUP BY first_seen_date
)
SELECT s.event_date,
       COALESCE(aw.active_wallets, 0) AS active_wallets,
       COALESCE(nw.new_wallets, 0)    AS new_wallets,
       COALESCE(d.tx_count, 0)        AS tx_count,
       COALESCE(d.failed_tx_count, 0) AS failed_tx_count,
       COALESCE(d.whale_tx_count, 0)  AS whale_tx_count,
       COALESCE(d.total_volume_pol, 0) AS total_volume_pol,
       COALESCE(d.total_gas_usd, 0)    AS total_gas_usd,
       COALESCE(d.total_gas_native, 0) AS total_gas_native,
       COALESCE(d.from_wallets, 0) AS from_wallets,
       COALESCE(d.to_wallets, 0)   AS to_wallets
FROM date_spine s
LEFT JOIN daily d          USING (event_date)
LEFT JOIN active_wallets aw USING (event_date)
LEFT JOIN new_wallets nw   USING (event_date)
ORDER BY s.event_date;
"""

PART5_SOURCES = {
    "cohort_retention_matrix.csv": DATA_PROCESSED / "cohort_retention.csv",
    "rfm_segment_summary.csv": DATA_PROCESSED / "segment_summary.csv",
}


def export(name: str, df: pd.DataFrame) -> None:
    path = EXPORT_DIR / name
    if df.empty:
        raise SystemExit(f"export '{name}' produced zero rows - aborting")
    df.to_csv(path, index=False)
    print(f"  {name:<30} {len(df):>8,} rows  {path.stat().st_size:>12,} bytes")


def main() -> None:
    os.makedirs(EXPORT_DIR, exist_ok=True)

    print(f"querying warehouse and exporting to {EXPORT_DIR}\n")

    print("fact_transactions.csv (158.9k txs, denormalized) ...")
    fact = pd.read_sql(sa.text(FACT_TRANSACTIONS_SQL), engine)
    export("fact_transactions.csv", fact)

    print("dim_wallets.csv (one row per wallet + recency/monetary) ...")
    dim = pd.read_sql(sa.text(DIM_WALLETS_SQL), engine)
    export("dim_wallets.csv", dim)

    print("daily_kpi_summary.csv (one row per date, zero-filled) ...")
    daily = pd.read_sql(sa.text(DAILY_KPI_SQL), engine)
    export("daily_kpi_summary.csv", daily)

    print("Part 5 outputs (copy from data/processed/) ...")
    for target, source in PART5_SOURCES.items():
        shutil.copyfile(source, EXPORT_DIR / target)
        print(f"  {target:<30} {(EXPORT_DIR / target).stat().st_size:>12,} bytes"
              f"  (copied from {source.name})")

    print("\nall extracts written")


if __name__ == "__main__":
    main()