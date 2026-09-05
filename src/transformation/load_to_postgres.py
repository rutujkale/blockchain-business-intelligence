"""Load cleaned CSVs and contract metadata into the local PostgreSQL warehouse.

Creates the schema from data/sql/schema.sql, derives the wallets table from
from/to addresses, loads all tables, prints row counts per table and runs a
referential integrity check on foreign keys.

Usage:
    python src/transformation/load_to_postgres.py [--reset]
"""

import os
import sys
from pathlib import Path

import pandas as pd
import sqlalchemy as sa
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
DATA_RAW = PROJECT_ROOT / "data" / "raw"
SCHEMA_SQL = PROJECT_ROOT / "data" / "sql" / "schema.sql"

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set in .env")


def clean_nulls(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN/NaT values with None so psycopg2 can send NULLs reliably."""
    return df.where(pd.notna(df), None)


def run_schema(engine: sa.Engine, reset: bool) -> None:
    sql = SCHEMA_SQL.read_text(encoding="utf-8")
    if reset:
        sql = ("DROP TABLE IF EXISTS token_transfers; "
               "DROP TABLE IF EXISTS transactions; "
               "DROP TABLE IF EXISTS contracts; "
               "DROP TABLE IF EXISTS wallets; ") + sql
    with engine.raw_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print("schema ready" + (" (existing tables dropped)" if reset else ""))


def load_contracts(engine: sa.Engine) -> int:
    df = pd.read_csv(DATA_RAW / "contracts_metadata.csv", dtype=str, keep_default_na=False)
    df = df.rename(columns={"contract_address": "contract_address"})
    out = pd.DataFrame({
        "contract_address": df["contract_address"].str.lower(),
        "name": df["name"],
        "category": df["category"],
        "verified": df["verified"].str.lower().isin(["true"]),
        "creation_date": pd.to_datetime(df["creation_date"], errors="coerce").dt.date,
    })
    out = clean_nulls(out)
    out.to_sql("contracts", engine, if_exists="append", index=False,
               method="multi", chunksize=200)
    return len(out)


def load_wallets(engine: sa.Engine) -> int:
    t = pd.read_csv(DATA_PROCESSED / "transactions_clean.csv",
                    dtype={"tx_hash": str, "from_address": str, "to_address": str})
    tt = pd.read_csv(DATA_PROCESSED / "token_transfers_clean.csv",
                     dtype={"tx_hash": str, "from_address": str, "to_address": str})
    if tt.empty:
        tt = pd.DataFrame(columns=["tx_hash", "from_address", "to_address"])

    t_clean = pd.read_csv(DATA_PROCESSED / "transactions_clean.csv",
                          parse_dates=["timestamp"])
    t_date = t_clean[["from_address", "to_address", "timestamp"]].copy()
    t_dates = pd.concat([
        t_date[["from_address", "timestamp"]].rename(columns={"from_address": "address"}),
        t_date[["to_address", "timestamp"]].rename(columns={"to_address": "address"}),
    ])
    t_dates = t_dates[t_dates["address"].notna()]

    min_dates = t_dates.groupby("address")["timestamp"].min()
    max_dates = t_dates.groupby("address")["timestamp"].max()

    from_counts = t["from_address"].value_counts()
    to_counts = t["to_address"].value_counts()
    addresses = sorted(set(t["from_address"]) | set(t["to_address"]) |
                       set(tt["from_address"]) | set(tt["to_address"]))
    addresses = [a for a in addresses if isinstance(a, str) and a]

    contracts = pd.read_sql("SELECT contract_address FROM contracts", engine)
    contract_set = set(contracts["contract_address"])

    rows = []
    for addr in addresses:
        total_tx = int((from_counts.get(addr, 0) or 0) + (to_counts.get(addr, 0) or 0))
        volume = float(t_clean.loc[t_clean["to_address"] == addr, "value_native"].sum())
        first = min_dates.get(addr, pd.NaT)
        last = max_dates.get(addr, pd.NaT)
        rows.append({
            "wallet_address": addr,
            "first_seen_date": first.date() if pd.notna(first) else None,
            "last_seen_date": last.date() if pd.notna(last) else None,
            "total_transactions": total_tx,
            "total_volume": volume,
            "wallet_segment": None,
            "is_contract": addr in contract_set,
        })

    df = clean_nulls(pd.DataFrame(rows))
    df.to_sql("wallets", engine, if_exists="append", index=False,
              method="multi", chunksize=1000)
    return len(df)


def load_transactions(engine: sa.Engine) -> int:
    df = pd.read_csv(DATA_PROCESSED / "transactions_clean.csv",
                     parse_dates=["timestamp"])
    df = df.rename(columns={
        "from_address": "from_wallet",
        "to_address": "to_wallet",
        "gas_price_wei": "gas_price",
    })
    df = df[["tx_hash", "from_wallet", "to_wallet", "timestamp", "value_native",
             "gas_used", "gas_price", "gas_cost_native", "gas_cost_usd",
             "status", "is_whale_transaction", "block_number"]]
    df = clean_nulls(df)
    df.to_sql("transactions", engine, if_exists="append", index=False,
              method="multi", chunksize=2000)
    return len(df)


def load_token_transfers(engine: sa.Engine) -> int:
    df = pd.read_csv(DATA_PROCESSED / "token_transfers_clean.csv",
                     parse_dates=["timestamp"])
    if df.empty:
        return 0
    df = df.rename(columns={
        "token_contract": "token_contract",
        "from_address": "from_wallet",
        "to_address": "to_wallet",
    })
    df = df[["transfer_id", "tx_hash", "token_contract", "from_wallet", "to_wallet",
             "amount", "token_symbol", "is_spam", "timestamp"]]
    df = clean_nulls(df)

    with engine.connect() as conn:
        existing = {row[0] for row in conn.execute(
            sa.text("SELECT contract_address FROM contracts"))}
    missing_contracts = sorted(
        set(df["token_contract"]) - existing & set(df["token_contract"]))
    if missing_contracts:
        add = pd.DataFrame({
            "contract_address": missing_contracts,
            "name": None,
            "category": "Token",
            "verified": False,
            "creation_date": None,
        })
        add.to_sql("contracts", engine, if_exists="append", index=False,
                   method="multi", chunksize=200)
        print(f"  added {len(add)} missing token contracts to contracts table")

    df.to_sql("token_transfers", engine, if_exists="append", index=False,
              method="multi", chunksize=500)
    return len(df)


def row_counts(engine: sa.Engine) -> None:
    print("\n== row counts ==")
    with engine.connect() as conn:
        for table in ("wallets", "contracts", "transactions", "token_transfers"):
            count = conn.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"  {table:16s} {count}")


def integrity_check(engine: sa.Engine) -> None:
    print("\n== referential integrity (orphan counts, expect 0) ==")
    checks = {
        "transactions.from_wallet -> wallets": (
            "SELECT COUNT(*) FROM transactions t LEFT JOIN wallets w"
            " ON t.from_wallet = w.wallet_address WHERE w.wallet_address IS NULL"),
        "transactions.to_wallet -> wallets": (
            "SELECT COUNT(*) FROM transactions t LEFT JOIN wallets w"
            " ON t.to_wallet = w.wallet_address WHERE w.wallet_address IS NULL"),
        "token_transfers.token_contract -> contracts": (
            "SELECT COUNT(*) FROM token_transfers x LEFT JOIN contracts c"
            " ON x.token_contract = c.contract_address WHERE c.contract_address IS NULL"),
        "token_transfers.from_wallet -> wallets": (
            "SELECT COUNT(*) FROM token_transfers x LEFT JOIN wallets w"
            " ON x.from_wallet = w.wallet_address WHERE w.wallet_address IS NULL"),
        "token_transfers.to_wallet -> wallets": (
            "SELECT COUNT(*) FROM token_transfers x LEFT JOIN wallets w"
            " ON x.to_wallet = w.wallet_address WHERE w.wallet_address IS NULL"),
    }
    ok = True
    with engine.connect() as conn:
        for label, sql in checks.items():
            orphans = conn.execute(sa.text(sql)).scalar()
            status = "OK" if orphans == 0 else "FAIL"
            print(f"  {status}  {label}: {orphans}")
            ok = ok and orphans == 0
    print("\nreferential integrity:", "PASS" if ok else "FAIL")


def main():
    reset = "--reset" in sys.argv
    engine = sa.create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

    with engine.connect() as conn:
        existing = conn.execute(sa.text(
            "SELECT COUNT(*) FROM information_schema.tables"
            " WHERE table_schema='public' AND table_name IN"
            " ('wallets','contracts','transactions','token_transfers')")).scalar()

    if existing and not reset:
        print("tables already exist - use --reset to rebuild")
        row_counts(engine)
        integrity_check(engine)
        return

    run_schema(engine, reset)
    n = load_contracts(engine)
    print(f"  loaded contracts: {n}")
    n = load_wallets(engine)
    print(f"  loaded wallets: {n}")
    n = load_transactions(engine)
    print(f"  loaded transactions: {n}")
    n = load_token_transfers(engine)
    print(f"  loaded token_transfers: {n}")

    row_counts(engine)
    integrity_check(engine)


if __name__ == "__main__":
    main()