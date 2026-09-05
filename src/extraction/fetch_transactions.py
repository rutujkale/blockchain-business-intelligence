import os
import json
import csv
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("EXPLORER_API_KEY")
if not API_KEY:
    raise SystemExit("EXPLORER_API_KEY not set in .env")

CONTRACT_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  # Aave V3 Pool — Polygon
CHAIN_ID = 137  # Polygon PoS mainnet
BASE_URL = "https://api.etherscan.io/v2/api"
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_RAW.mkdir(parents=True, exist_ok=True)

MONTHS_BACK = 6
PAGE_SIZE = 1000              # Etherscan V2 returns max 1000 rows per call
CHUNK_BLOCKS = 172800         # ~4 days at ~2s/block on Polygon
RATE_LIMIT_DELAY = 0.11       # sleep between calls
MAX_RETRIES = 5
RESULT_WINDOW_CAP = 10000     # PageNo x Offset must be <= this


class ResultWindowTooLarge(Exception):
    pass


def api_get(params: dict, retry_attempts: int = 0) -> list | dict:
    params["chainid"] = CHAIN_ID
    params["apikey"] = API_KEY
    attempt = 0
    while attempt <= MAX_RETRIES:
        try:
            resp = requests.get(BASE_URL, params=params, timeout=45)
        except requests.RequestException as exc:
            attempt += 1
            wait = 2 ** attempt
            print(f"    [network: {type(exc).__name__}] retry in {wait}s ({attempt}/{MAX_RETRIES})", flush=True)
            time.sleep(wait)
            continue
        if resp.status_code == 429:
            attempt += 1
            wait = 2 ** attempt
            print(f"    [429] retry in {wait}s ({attempt}/{MAX_RETRIES})", flush=True)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        message = str(data.get("message", ""))
        if data.get("status") == "0":
            if "No transactions found" in message:
                return []
            if "Result window is too large" in message:
                raise ResultWindowTooLarge()
            if "rate limit" in message.lower() or "Max rate limit" in message:
                attempt += 1
                wait = 2 ** attempt
                print(f"    [rate-limit response] retry in {wait}s ({attempt}/{MAX_RETRIES})", flush=True)
                time.sleep(wait)
                continue
            print(f"    [unexpected] status={data.get('status')} message={message}", flush=True)
            return data.get("result", []) if isinstance(data.get("result"), list) else []
        return data["result"]
    raise RuntimeError(f"API call failed after {MAX_RETRIES} retries")


def get_block_by_timestamp(timestamp: int) -> int | None:
    params = {
        "module": "block",
        "action": "getblocknobytime",
        "timestamp": str(timestamp),
        "closest": "before",
    }
    result = api_get(params)
    try:
        return int(result) if result else None
    except (TypeError, ValueError):
        print(f"    [warn] could not resolve block for timestamp {timestamp}", flush=True)
        return None


def load_progress() -> dict:
    p = DATA_RAW / "extraction_progress.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"txlist": None, "tokentx": None, "start_block": None, "end_block": None}


def save_progress(state: dict) -> None:
    (DATA_RAW / "extraction_progress.json").write_text(json.dumps(state, indent=2), encoding="utf-8")


def pull_span(action: str, start_block: int, end_block: int, state: dict):
    """Pull a single block window with pagination; returns list of rows.

    If the window exceeds the 10,000-row result cap, raises
    ResultWindowTooLarge so the caller can split it.
    """
    rows: list[dict] = []
    page = 1
    while True:
        params = {
            "module": "account",
            "action": action,
            "address": CONTRACT_ADDRESS,
            "startblock": start_block,
            "endblock": end_block,
            "sort": "asc",
            "page": page,
            "offset": PAGE_SIZE,
        }
        result = api_get(params)
        if not result:
            break
        rows.extend(result)
        if len(result) < PAGE_SIZE:
            break
        time.sleep(RATE_LIMIT_DELAY)
        page += 1
    return rows


def pull_stream(action: str, filename: str, start_block: int, end_block: int,
                state: dict, dedup_key: callable):
    """Pull the full range in block chunks, resuming from state, writing CSV
    incrementally. Returns (dst_file, rows_written, first_ts, last_ts)."""
    out = DATA_RAW / filename
    last_done = state.get(action)
    cur = last_done + 1 if last_done is not None else start_block
    if cur > end_block:
        print(f"  [{action}] already complete, skipping", flush=True)
        return out, state.get(f"{action}_rows", 0), None, None

    first_write = last_done is None
    header_written = not first_write  # deduplicate header when resuming
    seen: set = set()
    rows_written = 0
    first_ts = None
    last_ts = None

    f = open(out, "w", newline="", encoding="utf-8") if first_write else open(out, "a", newline="", encoding="utf-8")
    writer = None
    chunk_start = cur
    chunk_size = CHUNK_BLOCKS
    skipped_last = False
    with f:
        while chunk_start < end_block:
            chunk_end = min(chunk_start + chunk_size, end_block)
            label = f"{action} [{chunk_start}..{chunk_end}]"
            try:
                rows = pull_span(action, chunk_start, chunk_end, state)
            except ResultWindowTooLarge:
                chunk_size = max(chunk_size // 2, 7200)  # ~10 min
                print(f"  [{label}] window too large, splitting (chunk={chunk_size})", flush=True)
                continue

            if writer is None and rows:
                keys = list(rows[0].keys())
                writer = csv.DictWriter(f, fieldnames=keys)
                if not header_written:
                    writer.writeheader()
                    header_written = True

            new_rows = 0
            for r in rows:
                k = dedup_key(r)
                if k in seen:
                    continue
                seen.add(k)
                writer.writerow(r)
                new_rows += 1
                ts = int(r.get("timeStamp", 0) or 0)
                if ts:
                    first_ts = ts if first_ts is None else min(first_ts, ts)
                    last_ts = ts if last_ts is None else max(last_ts, ts)
            rows_written += new_rows
            print(f"  [{label}] {len(rows)} fetch / {new_rows} new (cumulative {rows_written})", flush=True)
            time.sleep(RATE_LIMIT_DELAY)

            state[action] = chunk_end - 1
            state[f"{action}_rows"] = rows_written
            save_progress(state)
            chunk_start = chunk_end
            skipped_last = False

    return out, rows_written, first_ts, last_ts


def main():
    date_from = datetime.now(timezone.utc) - timedelta(days=MONTHS_BACK * 30)
    date_to = datetime.now(timezone.utc)
    print(f"Contract : {CONTRACT_ADDRESS}", flush=True)
    print(f"Date range: {date_from.date()} -> {date_to.date()}", flush=True)
    print(f"API key  : ...{API_KEY[-4:]}", flush=True)

    state = load_progress()
    start_block = state.get("start_block") or get_block_by_timestamp(int(date_from.timestamp()))
    end_block = state.get("end_block") or get_block_by_timestamp(int(date_to.timestamp()))
    if not start_block:
        raise SystemExit("Could not resolve start block")
    if not end_block:
        end_block = 99999999
    print(f"Block range: {start_block} -> {end_block}", flush=True)

    print("--- Pulling normal transactions ---", flush=True)
    tx_file, tx_rows, tx_first, tx_last = pull_stream(
        "txlist", "transactions_raw.csv", start_block, end_block, state,
        dedup_key=lambda r: r.get("hash", ""),
    )

    print("--- Pulling ERC-20 token transfers ---", flush=True)
    tt_file, tt_rows, tt_first, tt_last = pull_stream(
        "tokentx", "token_transfers_raw.csv", start_block, end_block, state,
        dedup_key=lambda r: (
            r.get("hash", ""), r.get("transactionIndex", ""),
            r.get("from", ""), r.get("to", ""),
            r.get("contractAddress", ""), r.get("value", ""),
        ),
    )

    def file_metrics(filename):
        """Return (row_count, date_range) by scanning the final CSV."""
        out = DATA_RAW / filename
        if not out.exists():
            return 0, (None, None)
        rows = 0
        lo = None
        hi = None
        with open(out, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows += 1
                try:
                    ts = int(r.get("timeStamp", 0) or 0)
                except (TypeError, ValueError):
                    continue
                if ts:
                    lo = ts if lo is None else min(lo, ts)
                    hi = ts if hi is None else max(hi, ts)
        dates = None
        if lo:
            dates = (
                datetime.fromtimestamp(lo, tz=timezone.utc).date(),
                datetime.fromtimestamp(hi, tz=timezone.utc).date(),
            )
        return rows, dates

    tx_rows, tx_dates = file_metrics("transactions_raw.csv")
    tt_rows, _ = file_metrics("token_transfers_raw.csv")

    log = {
        "contract": CONTRACT_ADDRESS,
        "chain": "polygon",
        "extraction_timestamp": datetime.now(timezone.utc).isoformat(),
        "date_range_requested": f"{date_from.date()} -> {date_to.date()}",
        "date_range_actual": f"{tx_dates[0]} -> {tx_dates[1]}" if tx_dates else "no data",
        "block_range": f"{start_block} -> {end_block}",
        "transactions_raw": tx_rows,
        "token_transfers_raw": tt_rows,
        "in_progress": False,
    }
    (DATA_RAW / "extraction_log.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
    print("--- Extraction log written ---", flush=True)
    print(json.dumps(log, indent=2), flush=True)


if __name__ == "__main__":
    main()