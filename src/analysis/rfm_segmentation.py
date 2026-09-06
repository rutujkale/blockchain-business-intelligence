"""RFM segmentation of Aave V3 Pool wallets (Part 5A).

For every wallet in the warehouse, computes from the `transactions` and
`token_transfers` tables:

  * Recency   = days since last on-chain activity (any tx from/to the wallet,
                plus token transfers), relative to the max timestamp in the
                dataset
  * Frequency = total transaction count (wallets.total_transactions)
  * Monetary  = native POL volume (wallets.total_volume), falling back to the
                max non-spam token transfer amount when native volume is zero
                -- mirrors the is_whale_transaction definition in schema.sql
                ("native value else max per-tx token transfer amount")

Each dimension is scored 1-5 with SQL NTILE(5) (bucket 5 = most recent /
most frequent / most valuable). The three scores are combined into 7 segments
in a single CASE WHEN using the exact spec mapping (no gaps: every wallet gets
exactly one segment, unmatched rows fall back to "Occasional Users").

The pipeline:
  1. CREATE TEMP TABLE rfm_scores AS (scoring + segmentation query)
  2. UPDATE wallets.wallet_segment FROM rfm_scores
  3. Print + save the segment summary table to data/processed/segment_summary.csv
     (dashboard input)

Usage:
    python src/analysis/rfm_segmentation.py
"""

import os
from pathlib import Path

import pandas as pd
import sqlalchemy as sa
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set in .env")

# Disable query JIT: the local WSL2 PostgreSQL server is missing the LLVM
# runtime, so complex analytical queries fail with
# "could not load library .../llvmjit.so".
CONNECT_ARGS = {"options": "-c jit=off"}
engine = sa.create_engine(DATABASE_URL, connect_args=CONNECT_ARGS)

RFM_SQL = """
CREATE TEMP TABLE rfm_scores AS
WITH activity AS (
    SELECT from_wallet AS wallet, timestamp AS ts FROM transactions
    UNION ALL SELECT to_wallet, timestamp FROM transactions
    UNION ALL SELECT from_wallet, timestamp FROM token_transfers
    UNION ALL SELECT to_wallet, timestamp FROM token_transfers
),
-- most recent on-chain activity per wallet (transactions + token transfers)
last_activity AS (
    SELECT wallet, MAX(ts) AS last_ts FROM activity GROUP BY wallet
),
-- largest non-spam token transfer amount per wallet (monetary fallback)
non_spam_tokens AS (
    SELECT wallet, MAX(amount) AS max_amt FROM (
        SELECT from_wallet AS wallet, amount FROM token_transfers WHERE is_spam = FALSE
        UNION ALL
        SELECT to_wallet, amount FROM token_transfers WHERE is_spam = FALSE
    ) t
    GROUP BY wallet
),
-- max timestamp anywhere in the dataset (recency baseline)
dataset_max AS (
    SELECT MAX(ts) AS max_ts FROM (
        SELECT MAX(timestamp) AS ts FROM transactions
        UNION ALL SELECT MAX(timestamp) FROM token_transfers
    ) u
),
scored AS (
    SELECT w.wallet_address,
           w.first_seen_date,
           w.total_transactions AS frequency,
           COALESCE(NULLIF(w.total_volume, 0), nt.max_amt, 0) AS monetary_units,
           EXTRACT(EPOCH FROM (d.max_ts - la.last_ts)) / 86400.0 AS recency_days,
           d.max_ts
    FROM wallets w
    LEFT JOIN last_activity la ON la.wallet = w.wallet_address
    LEFT JOIN non_spam_tokens nt ON nt.wallet = w.wallet_address
    CROSS JOIN dataset_max d
),
quintiles AS (
    SELECT s.wallet_address,
           s.first_seen_date,
           s.frequency,
           s.monetary_units,
           s.recency_days,
           -- bucket 5 = most recent / most frequent / most valuable
           NTILE(5) OVER (ORDER BY s.recency_days DESC, s.wallet_address) AS r_score,
           NTILE(5) OVER (ORDER BY s.frequency,   s.wallet_address) AS f_score,
           NTILE(5) OVER (ORDER BY s.monetary_units, s.wallet_address) AS m_score,
           s.max_ts
    FROM scored s
),
segmented AS (
    SELECT q.wallet_address,
           q.r_score, q.f_score, q.m_score,
           q.frequency,
           q.monetary_units,
           q.recency_days,
           q.first_seen_date,
           q.max_ts,
           CASE
               WHEN q.r_score >= 4 AND q.f_score >= 4 AND q.m_score >= 4
                   THEN 'High-Value Active'
               WHEN q.r_score <= 2 AND q.m_score >= 4
                   THEN 'High-Value Dormant'
               WHEN q.f_score >= 4 AND q.m_score < 4
                   THEN 'Frequent Users'
               WHEN q.r_score >= 4 AND q.f_score <= 2 AND q.m_score <= 2
                    AND q.first_seen_date >= (q.max_ts::date - 60)
                   THEN 'Emerging Users'
               WHEN q.f_score BETWEEN 2 AND 3 AND q.m_score BETWEEN 2 AND 3
                   THEN 'Occasional Users'
               WHEN q.r_score <= 2 AND q.f_score <= 2 AND q.m_score <= 2
                   THEN 'Dormant Users'
               WHEN q.first_seen_date >= (q.max_ts::date - 30) AND q.f_score <= 1
                   THEN 'New Users'
               ELSE 'Occasional Users'
           END AS segment
    FROM quintiles q
)
SELECT wallet_address, r_score, f_score, m_score, frequency, monetary_units,
       recency_days, first_seen_date, max_ts, segment
FROM segmented;
"""

UPDATE_WALLETS_SQL = """
UPDATE wallets w
SET wallet_segment = s.segment
FROM rfm_scores s
WHERE w.wallet_address = s.wallet_address;
"""

SUMMARY_SQL = """
SELECT w.wallet_segment AS segment,
       COUNT(*) AS wallet_count,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct_wallets,
       ROUND(100.0 * SUM(w.total_volume) / NULLIF(SUM(SUM(w.total_volume)) OVER (), 0), 2)
           AS pct_volume,
       ROUND(AVG(w.total_transactions), 1) AS avg_transactions_per_wallet
FROM wallets w
GROUP BY w.wallet_segment
ORDER BY wallet_count DESC;
"""

DISTRIBUTION_SQL = """
SELECT r_score, f_score, m_score, COUNT(*) AS n
FROM rfm_scores
GROUP BY r_score, f_score, m_score
ORDER BY r_score, f_score, m_score;
"""

EDGE_SQL = """
SELECT
    (SELECT COUNT(*) FROM rfm_scores) AS total_wallets,
    ROUND((SELECT MIN(recency_days) FROM rfm_scores), 1) AS min_recency_days,
    ROUND((SELECT MAX(recency_days) FROM rfm_scores), 1) AS max_recency_days,
    ROUND((SELECT AVG(monetary_units) FROM rfm_scores), 6) AS avg_monetary_units,
    (SELECT COUNT(*) FROM rfm_scores WHERE monetary_units > 0) AS wallets_with_value,
    (SELECT MAX(ts) FROM (
         SELECT MAX(timestamp) AS ts FROM transactions
         UNION ALL SELECT MAX(timestamp) FROM token_transfers
     ) u) AS dataset_max_ts;
"""

TOP_VALUE_SQL = """
SELECT wallet_address, ROUND(monetary_units::numeric, 6) AS monetary_units, segment
FROM rfm_scores
ORDER BY monetary_units DESC
LIMIT 8;
"""


def main() -> None:
    os.makedirs(DATA_PROCESSED, exist_ok=True)

    with engine.begin() as conn:
        print("computing RFM scores and segments (CREATE TEMP TABLE) ...")
        conn.execute(sa.text(RFM_SQL))

        print("writing segments into wallets.wallet_segment ...")
        result = conn.execute(sa.text(UPDATE_WALLETS_SQL))
        print(f"  -> {result.rowcount} wallets updated")

        df_edge = pd.read_sql(sa.text(EDGE_SQL), conn)
        df_summary = pd.read_sql(sa.text(SUMMARY_SQL), conn)
        df_dist = pd.read_sql(sa.text(DISTRIBUTION_SQL), conn)
        df_top = pd.read_sql(sa.text(TOP_VALUE_SQL), conn)

    print("\n=== dataset / RFM edge facts ===")
    for _, r in df_edge.iterrows():
        print(f"  wallets={r['total_wallets']}  recency_days "
              f"[{r['min_recency_days']} .. {r['max_recency_days']}]  "
              f"avg_monetary={r['avg_monetary_units']} (n>0: "
              f"{r['wallets_with_value']})  max_ts={r['dataset_max_ts']}")

    print("\n=== segment summary ===")
    print(df_summary.to_string(index=False))

    print("\n=== wallets with the highest monetary value ===")
    print(df_top.to_string(index=False))

    print("\n=== RFM score combinations (r | f | m -> wallets) ===")
    print(df_dist.to_string(index=False))

    print(f"\nsaving segment summary -> {DATA_PROCESSED / 'segment_summary.csv'}")
    df_summary.to_csv(DATA_PROCESSED / "segment_summary.csv", index=False)

    total = df_summary["wallet_count"].sum()
    print(f"total wallets assigned: {int(total)}")


if __name__ == "__main__":
    main()