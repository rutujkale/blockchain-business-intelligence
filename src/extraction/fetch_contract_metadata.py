"""Fetch basic contract metadata for the target contract
and any other contracts that appear frequently in the raw transfer data."""

import os
import csv
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("EXPLORER_API_KEY")
if not API_KEY:
    raise SystemExit("EXPLORER_API_KEY not set in .env")

BASE_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID = 137  # Polygon PoS mainnet
DATA_RAW = PROJECT_ROOT / "data" / "raw"
RATE_LIMIT_DELAY = 0.11
MAX_RETRIES = 5

TARGET_CONTRACT = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"  # Aave V3 Pool

# Well-known protocol/token contracts we expect to see (lowercased keys -> labels)
KNOWN_CONTRACTS = {k.lower(): v for k, v in {
    "0x794a61358D6845594F94dc1DB02A252b5b4814aD": {"name": "Aave V3 Pool", "category": "Lending"},
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270": {"name": "Wrapped MATIC (WMATIC)", "category": "Token"},
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": {"name": "USDC (PoS)", "category": "Token"},
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": {"name": "USDT (PoS)", "category": "Token"},
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619": {"name": "WETH (PoS)", "category": "Token"},
    "0xD6DF932A45C0f255f85145f286eA0b292B21C90B": {"name": "AAVE (PoS)", "category": "Token"},
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": {"name": "USDC (Bridged)", "category": "Token"},
}.items()}


def api_get(params: dict) -> dict | list:
    params["chainid"] = CHAIN_ID
    params["apikey"] = API_KEY
    attempt = 0
    while attempt <= MAX_RETRIES:
        try:
            resp = requests.get(BASE_URL, params=params, timeout=45)
        except requests.RequestException as exc:
            attempt += 1
            time.sleep(2 ** attempt)
            continue
        if resp.status_code == 429:
            attempt += 1
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "0":
            return []
        return data.get("result", [])
    return []


def get_top_contracts_from_transfers(top_n: int = 15) -> list[str]:
    """Scan token_transfers_raw.csv and return the most frequent contract addresses."""
    tt_path = DATA_RAW / "token_transfers_raw.csv"
    if not tt_path.exists():
        return []
    contract_counts: dict[str, int] = {}
    with open(tt_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            addr = row.get("contractAddress", "").lower()
            if addr:
                contract_counts[addr] = contract_counts.get(addr, 0) + 1
    sorted_contracts = sorted(contract_counts.items(), key=lambda x: x[1], reverse=True)
    return [c[0] for c in sorted_contracts[:top_n]]


def fetch_creation_date(creation_tx_hash: str) -> str:
    """Resolve contract creation date from its creation tx via the proxy API.

    Returns an ISO date string (YYYY-MM-DD) or an empty string.
    """
    if not creation_tx_hash:
        return ""
    params = {"module": "proxy", "action": "eth_getTransactionByHash", "txhash": creation_tx_hash}
    tx = api_get(params)
    if not isinstance(tx, dict) or not tx.get("blockNumber"):
        return ""
    params = {"module": "proxy", "action": "eth_getBlockByNumber",
              "tag": tx["blockNumber"], "boolean": "false"}
    block = api_get(params)
    if not isinstance(block, dict) or not block.get("timestamp"):
        return ""
    try:
        ts = int(block["timestamp"], 16)
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return ""


def fetch_contract_info(address: str) -> dict:
    """Name + verified status from getsourcecode, creator from getcontractcreation."""
    info = {
        "contract_address": address,
        "name": "",
        "category": "Unknown",
        "verified": False,
        "creator": "",
        "creation_tx_hash": "",
        "creation_date": "",
    }

    # Verified source gives the contract name; empty name == unverified
    params = {"module": "contract", "action": "getsourcecode", "address": address}
    result = api_get(params)
    if isinstance(result, list) and result:
        row = result[0]
        info["name"] = row.get("ContractName", "")
        info["verified"] = bool(row.get("SourceCode", ""))

    params = {"module": "contract", "action": "getcontractcreation", "contractaddresses": address}
    result = api_get(params)
    if isinstance(result, list) and result:
        info["creator"] = result[0].get("contractCreator", "")
        info["creation_tx_hash"] = result[0].get("txHash", "")

    if info["creation_tx_hash"]:
        info["creation_date"] = fetch_creation_date(info["creation_tx_hash"])

    known = KNOWN_CONTRACTS.get(address.lower())
    if known:
        info["category"] = known["category"]
        if not info["name"]:
            info["name"] = known["name"]

    return info


def main():
    addresses = [TARGET_CONTRACT] + list(KNOWN_CONTRACTS.keys())
    extra = get_top_contracts_from_transfers(top_n=15)
    for addr in extra:
        if addr.lower() not in [a.lower() for a in addresses]:
            addresses.append(addr)

    addresses = list(dict.fromkeys(a.lower() for a in addresses))

    rows: list[dict] = []
    for i, addr in enumerate(addresses):
        print(f"  [{i+1}/{len(addresses)}] {addr} ...", end=" ", flush=True)
        info = fetch_contract_info(addr)
        rows.append(info)
        print(f"{info['name'] or '(unverified)'} verified={info['verified']}", flush=True)
        time.sleep(RATE_LIMIT_DELAY)

    out = DATA_RAW / "contracts_metadata.csv"
    if rows:
        keys = list(rows[0].keys())
        with open(out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nWritten {len(rows)} contracts to {out.name}")
    else:
        print("\nNo contract data collected.")


if __name__ == "__main__":
    main()