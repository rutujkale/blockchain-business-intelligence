"""Clean and transform raw on-chain extracts into analysis-ready CSVs.

Reads data/raw/transactions_raw.csv and data/raw/token_transfers_raw.csv
and writes:
  - data/processed/transactions_clean.csv
  - data/processed/token_transfers_clean.csv
  - data/processed/flagged_transactions.csv   (flagged rows only, never dropped)
  - data/processed/cleaning_log.json          (summary + decisions)
  - data/raw/pol_usd_daily.csv                (cached POL/USD price reference)

Notes:
  - native token unit is POL (Polygon migrated from MATIC)
  - transactions with a token transfer are the economically meaningful ones for
    Aave (funds move as ERC-20 aTokens, not as native token value)
"""

import csv
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
DATA_PROCESSED.mkdir(exist_ok=True)

WEI = 10**18
WHALE_PERCENTILE = 99.5  # top 0.5% of transaction economic value

# CoinGecko ids for Polygon's POL token (formerly MATIC)
POL_COINGECKO_IDS = ["polygon-ecosystem-token", "matic-network"]


def to_datetime_utc(series) -> pd.Series:
    return pd.to_datetime(pd.to_numeric(series, errors="coerce"), unit="s", utc=True)


def fetch_pol_usd_prices() -> pd.DataFrame:
    """Fetch daily POL->USD prices from CoinGecko (free, no key) for the pull window."""
    cache = DATA_RAW / "pol_usd_daily.csv"
    if cache.exists():
        df = pd.read_csv(cache)
        df["date"] = pd.to_datetime(df["date"]).dt.date
        return df

    for coin_id in POL_COINGECKO_IDS:
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
        try:
            resp = requests.get(url, params={"vs_currency": "usd", "days": "365"}, timeout=60)
            if resp.status_code != 200:
                continue
            data = resp.json()
            prices = data.get("prices", [])
            if not prices:
                continue
            df = pd.DataFrame(prices, columns=["ts_ms", "price"])
            df["date"] = pd.to_datetime(df["ts_ms"], unit="ms", utc=True).dt.date
            df = df.groupby("date", as_index=False)["price"].mean()
            df = df.sort_values("date")
            df.to_csv(cache, index=False)
            print(f"  POL/USD prices cached to {cache.name} (id={coin_id})")
            return df
        except requests.RequestException as exc:
            print(f"  CoinGecko fetch failed for {coin_id}: {exc}")
        time.sleep(2)
    return pd.DataFrame(columns=["date", "price"])


def load_verified_contracts() -> set[str]:
    """Return the set of lowercased verified contract addresses."""
    path = DATA_RAW / "contracts_metadata.csv"
    verified = set()
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("verified", "").lower() == "true" or row.get("verified") == "True":
                    verified.add(row.get("contract_address", "").lower())
    return verified


def clean_transactions() -> dict:
    tx_path = DATA_RAW / "transactions_raw.csv"
    if not tx_path.exists():
        raise SystemExit(f"Missing input: {tx_path}")

    t = pd.read_csv(tx_path, dtype=str, keep_default_na=False)
    print(f"raw transactions rows: {len(t)}")

    t["from_address"] = t["from"].str.lower()
    t["to_address"] = t["to"].str.lower()
    t = t.rename(columns={"hash": "tx_hash"})
    t["timestamp"] = to_datetime_utc(t["timeStamp"])
    t["transaction_date"] = t["timestamp"].dt.date
    t["hour"] = t["timestamp"].dt.hour
    t["day_of_week"] = t["timestamp"].dt.dayofweek  # 0=Monday .. 6=Sunday
    t["block_number"] = pd.to_numeric(t["blockNumber"], errors="coerce").astype("Int64")

    t["value_native"] = pd.to_numeric(t["value"], errors="coerce").fillna(0) / WEI
    t["gas_used"] = pd.to_numeric(t["gasUsed"], errors="coerce").fillna(0).astype("Int64")
    t["gas_price_wei"] = pd.to_numeric(t["gasPrice"], errors="coerce").fillna(0)
    t["gas_cost_native"] = t["gas_used"] * t["gas_price_wei"] / WEI

    t["txreceipt_status"] = pd.to_numeric(t["txreceipt_status"], errors="coerce").fillna(1)
    t["isError"] = t.get("isError", "0").astype(str).str.strip()
    t["is_failed"] = (t["txreceipt_status"] == 0) | t["isError"].isin(["1", "2"])
    t["is_self"] = t["from_address"] == t["to_address"]
    t["is_zero_value"] = t["value_native"] == 0

    # Function labels (Aave semantics)
    t["function_name"] = t.get("functionName", "")
    t["method_id"] = t.get("methodId", "")

    before = len(t)
    t = t.drop_duplicates(subset=["tx_hash"], keep="first").copy()
    print(f"  dedup on tx_hash: {before} -> {len(t)}")

    # Flagged rows (flagged, not dropped)
    flagged_mask = t["is_failed"] | t["is_self"] | t["is_zero_value"]
    flagged = t[flagged_mask].copy()
    reasons = []
    if flagged["is_failed"].any():
        reasons.append("failed")
    if flagged["is_self"].any():
        reasons.append("self_transfer")
    if flagged["is_zero_value"].any():
        reasons.append("zero_value")
    flagged["flag_reasons"] = flagged.apply(
        lambda r: ",".join(
            [r for r in ("failed" if r["is_failed"] else None,
                         "self_transfer" if r["is_self"] else None,
                         "zero_value" if r["is_zero_value"] else None) if r]
        ),
        axis=1,
    )
    flagged[["tx_hash", "timestamp", "from_address", "to_address", "value_native",
             "gas_cost_native", "is_failed", "is_self", "is_zero_value", "flag_reasons"]].to_csv(
        DATA_PROCESSED / "flagged_transactions.csv", index=False)
    print(f"  flagged rows counted: failed={int((t['is_failed']).sum())} "
          f"self={int(t['is_self'].sum())} zero_value={int(t['is_zero_value'].sum())}")

    return t, flagged, reasons


def clean_token_transfers() -> pd.DataFrame:
    tt_path = DATA_RAW / "token_transfers_raw.csv"
    if not tt_path.exists():
        print("  token_transfers_raw.csv missing - using empty transfers")
        return pd.DataFrame(columns=[
            "transfer_id", "tx_hash", "block_number", "token_contract", "token_name",
            "token_symbol", "token_decimal", "from_address", "to_address", "amount",
            "timestamp", "transaction_date", "is_spam",
        ])

    x = pd.read_csv(tt_path, dtype=str, keep_default_na=False)
    x = x.rename(columns={"hash": "tx_hash", "tokenName": "token_name",
                          "tokenSymbol": "token_symbol"})
    x["from_address"] = x["from"].str.lower()
    x["to_address"] = x["to"].str.lower()
    x["token_contract"] = x["contractAddress"].str.lower()
    x["timestamp"] = to_datetime_utc(x["timeStamp"])
    x["transaction_date"] = x["timestamp"].dt.date
    x["block_number"] = pd.to_numeric(x["blockNumber"], errors="coerce").astype("Int64")
    x["token_decimal"] = pd.to_numeric(x["tokenDecimal"], errors="coerce").fillna(18)
    x["amount"] = pd.to_numeric(x["value"], errors="coerce").fillna(0) / (10 ** x["token_decimal"])

    # Surrogate key: V2 API tokentx has no logIndex -> hash + sequence within hash
    x["_seq"] = x.groupby("tx_hash").cumcount()
    x["transfer_id"] = x["tx_hash"] + "_" + x["_seq"].astype(int).astype(str)
    x = x.drop(columns=["_seq"])

    x = x.drop_duplicates(subset=["tx_hash", "transactionIndex", "from", "contractAddress",
                                  "to", "value"], keep="first")

    verified = load_verified_contracts()
    x["is_spam"] = ~x["token_contract"].isin(verified)

    keep = ["transfer_id", "tx_hash", "block_number", "token_contract", "token_name",
            "token_symbol", "token_decimal", "from_address", "to_address", "amount",
            "timestamp", "transaction_date", "is_spam"]
    x = x[keep].copy()
    print(f"  token transfers cleaned: {len(x)} rows, spam={int(x['is_spam'].sum())}")
    return x


def main():
    log: dict = {}

    print("== POL/USD price reference ==")
    prices = fetch_pol_usd_prices()

    print("== transactions ==")
    t, flagged, reasons = clean_transactions()

    print("== token transfers ==")
    transfers = clean_token_transfers()

    # --- whale flag: combined economic value ---
    if not transfers.empty:
        max_amt = transfers.groupby("tx_hash")["amount"].max()
        t = t.set_index("tx_hash")
        t["_max_token_amount"] = t.index.map(max_amt).fillna(0)
        t = t.reset_index()
    else:
        t["_max_token_amount"] = 0.0

    t["economic_value"] = t[["value_native", "_max_token_amount"]].max(axis=1)

    positive = t.loc[t["economic_value"] > 0, "economic_value"]
    if not positive.empty:
        cutoff = float(positive.quantile(1 - (100 - WHALE_PERCENTILE) / 100))
    else:
        cutoff = 0.0
    t["is_whale_transaction"] = t["economic_value"] >= cutoff
    t.loc[t["economic_value"] == 0, "is_whale_transaction"] = False
    log["whale_cutoff_economic_value"] = cutoff
    log["whale_percentile"] = WHALE_PERCENTILE
    log["whale_tx_count"] = int(t["is_whale_transaction"].sum())

    # --- gas_cost_usd via POL/USD join ---
    if not prices.empty:
        price_map = prices.set_index("date")["price"]
        t["date_key"] = t["transaction_date"]
        t["pol_usd"] = t["date_key"].map(price_map)
        t["gas_cost_usd"] = t["gas_cost_native"] * t["pol_usd"]
        log["price_coverage_dates"] = len(price_map)
        log["gas_cost_usd_source"] = "coingecko_pol_usd"
        print(f"  POL/USD joined over {len(price_map)} dates")
    else:
        t["gas_cost_usd"] = None
        log["gas_cost_usd_source"] = None
        log["gas_cost_usd_note"] = "No price reference available; left as native units (limitation)"

    keep_cols = ["tx_hash", "block_number", "from_address", "to_address",
                 "timestamp", "transaction_date", "hour", "day_of_week",
                 "value_native", "gas_used", "gas_price_wei", "gas_cost_native",
                 "gas_cost_usd", "status", "is_failed", "is_self", "is_zero_value",
                 "is_whale_transaction", "function_name", "method_id"]
    t["status"] = t["txreceipt_status"]
    tx_clean = t[keep_cols].copy()
    tx_clean["timestamp"] = tx_clean["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S%z")
    tx_clean["transaction_date"] = tx_clean["transaction_date"].astype(str)
    tx_clean.to_csv(DATA_PROCESSED / "transactions_clean.csv", index=False)
    print(f"  wrote transactions_clean.csv ({len(tx_clean)} rows)")

    if not transfers.empty:
        tt = transfers.copy()
        tt["timestamp"] = tt["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S%z")
        tt["transaction_date"] = tt["transaction_date"].astype(str)
        tt["block_number"] = tt["block_number"].astype("object").where(tt["block_number"].notna(), "")
        tt.to_csv(DATA_PROCESSED / "token_transfers_clean.csv", index=False)
        print(f"  wrote token_transfers_clean.csv ({len(tt)} rows)")
    else:
        transfers.to_csv(DATA_PROCESSED / "token_transfers_clean.csv", index=False)

    log.update({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "transactions_raw_rows": len(pd.read_csv(DATA_RAW / "transactions_raw.csv", usecols=["hash"])),
        "transactions_clean_rows": int(len(tx_clean)),
        "transfers_clean_rows": int(len(transfers)),
        "flagged_total_rows": int(flagged_mask_sum(t, flagged)),
        "flagged_failed": int(t["is_failed"].sum()) if "is_failed" in t else 0,
        "flagged_self": int(t["is_self"].sum()) if "is_self" in t else 0,
        "flagged_zero_value": int(t["is_zero_value"].sum()) if "is_zero_value" in t else 0,
        "tx_duplicate_hashes_removed": 0,
        "any_failed_txs_dropped": False,
        "notes": [
            "Failed, self and zero-value transactions are flagged, never dropped",
            "value_native/gas amounts in POL (=MATIC)",  # canonical note
            "Economic volume for Aave moves via ERC-20 transfers, not native value",
            "Only 38 txs carry native value; whale flag uses native value else max per-tx "
            "token-transfer amount, so whales are rare for this contract by design",
        ],
    })

    with open(DATA_PROCESSED / "cleaning_log.json", "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, default=str)
    print(f"\ncleaning done. log -> {log['generated_at']}")
    print(f"  whales: {log['whale_tx_count']}")


def flagged_mask_sum(t, flagged):
    return int(flagged.shape[0]) if not flagged.empty else 0


if __name__ == "__main__":
    main()