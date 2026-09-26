"""Export the Next.js web app's static JSON payloads (Part 7).

The webapp in ``webapp/`` is read-only and database-free: it renders
pre-aggregated JSON committed into the repo, so the deployed site has zero
runtime data fetching. This script produces those payloads from the CSVs the
pipeline already wrote, so regeneration does not need PostgreSQL running:

    dashboard/data_extracts/fact_transactions.csv     (local-only, gitignored)
    dashboard/data_extracts/dim_wallets.csv
    dashboard/data_extracts/daily_kpi_summary.csv
    dashboard/data_extracts/rfm_segment_summary.csv
    dashboard/data_extracts/cohort_retention_matrix.csv
    data/processed/transactions_clean.csv             (function_name/method_id)
    data/raw/extraction_log.json, data/processed/cleaning_log.json

Outputs thirteen files into ``webapp/public/data/``: ``kpi_summary``,
``monthly_activity``, ``daily_activity``, ``segment_summary``,
``cohort_retention``, ``top_wallets``, ``hourly_activity``,
``function_breakdown``, ``wallet_detail``, ``findings``, ``recommendations``,
``limitations``, ``pipeline_meta``. Nothing is dumped at transaction level
except the bounded ``wallet_detail.json`` (top 25 wallets x 10 most recent
transactions) which powers the wallet drawer.

Two labeling rules are enforced in the payloads, because this dataset has two
different "active wallet" definitions that otherwise contradict each other
across pages (see docs/limitations.md and 07-webapp-dashboard-revised.md):

  * ``kpi_summary.json`` / ``monthly_activity.json`` -> ``monthly_active_wallets``
    (distinct wallets per calendar month, INCLUDING the Pool contract)
  * ``daily_activity.json`` -> ``dau`` (distinct wallets on a single day)

The Pool contract is included in MAU to stay consistent with the figures
already published in README.md and outputs/reports/business_recommendations.md.
``kpi_summary.json`` carries ``mau_includes_pool_contract: true`` so the UI can
say so out loud.

Usage:
    python src/analysis/export_for_webapp.py
"""

import json
from pathlib import Path
from typing import Any

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]

EXTRACTS = PROJECT_ROOT / "dashboard" / "data_extracts"
PROCESSED = PROJECT_ROOT / "data" / "processed"
RAW = PROJECT_ROOT / "data" / "raw"
OUT_DIR = PROJECT_ROOT / "webapp" / "public" / "data"

# The Aave V3 Pool proxy - recipient of every transaction in the dataset, so it
# is never a "user wallet" but does count as one distinct address in MAU.
POOL_CONTRACT = "0x794a61358d6845594f94dc1db02a252b5b4814ad"
POOL_SHORT = "0x794a...4814"

WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
WEEKDAY_LONG = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
]
MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Anything below this share of transaction count is folded into "Other" in the
# Protocol Activity Mix chart. Per-function detail is still published in full
# under function_breakdown.json -> "detail" so the table view loses nothing.
OTHER_BUCKET_THRESHOLD_PCT = 1.0

DRAWER_WALLET_COUNT = 25
DRAWER_EVENT_COUNT = 10
TOP_WALLET_COUNT = 20

POOLYGONSCAN_TX = "https://polygonscan.com/tx/"
POOLYGONSCAN_ADDR = "https://polygonscan.com/address/"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def short_addr(address: str) -> str:
    """0x1b54d7a3...5b7f0 - the display form used in tables and the drawer."""
    if not isinstance(address, str) or len(address) < 12:
        return str(address)
    return f"{address[:8]}...{address[-4:]}"


def clean(value: Any) -> Any:
    """Make a value JSON-safe: NaN/NA become None, numpy scalars become python."""
    if value is None or value is pd.NA:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and pd.isna(value):
        return None
    return value


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of JSON-safe dicts, NaN normalised to None."""
    return [
        {k: clean(v) for k, v in row.items()}
        for row in df.to_dict(orient="records")
    ]


def month_label(ym: str) -> str:
    """'2026-04' -> 'April 2026'."""
    year, month = ym.split("-")
    return f"{MONTHS_LONG[int(month) - 1]} {year}"


def require(path: Path) -> Path:
    if not path.exists():
        raise SystemExit(
            f"missing input: {path.relative_to(PROJECT_ROOT)}\n"
            "Run the pipeline in order (docs/methodology.md §6) before this script."
        )
    return path


def write_json(name: str, payload: Any) -> None:
    """Write one payload and report its size. Fails loudly on empty output."""
    if isinstance(payload, (list, dict)) and not payload:
        raise SystemExit(f"export '{name}' produced an empty payload - aborting")
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    rows = len(payload) if isinstance(payload, list) else len(payload.keys())
    print(f"  {name:<30} {rows:>4} keys/rows  {path.stat().st_size:>9,} bytes")


# --------------------------------------------------------------------------- #
# monthly activity
# --------------------------------------------------------------------------- #

def build_monthly_activity(fact: pd.DataFrame) -> pd.DataFrame:
    """Calendar-month rollup: MAU, new vs returning wallets, tx counts, gas.

    MAU is distinct addresses in from_wallet U to_wallet for the month, which
    includes the Pool contract. New wallets come from dim_wallets.first_seen_date
    (monthly distinct) rather than the daily extract, so new + returning
    reconciles exactly to MAU.
    """
    fact = fact.copy()
    fact["ym"] = fact["year"].astype(str) + "-" + fact["month"].astype(str).str.zfill(2)

    rows = []
    for ym, group in fact.groupby("ym"):
        active = pd.Index(
            pd.concat([group["from_wallet"], group["to_wallet"]]).dropna().unique()
        )
        rows.append({
            "month": ym,
            "monthly_active_wallets": int(len(active)),
            "tx_count": int(len(group)),
            "failed_tx_count": int((group["status"] == 0).sum()),
            "whale_tx_count": int(group["is_whale_transaction"].sum()),
            "total_gas_usd": round(float(group["gas_cost_usd"].sum()), 2),
            "total_volume_pol": round(float(group["value_native"].sum()), 6),
        })
    monthly = pd.DataFrame(rows).sort_values("month").reset_index(drop=True)

    # New wallets: first appearance anywhere in the ledger, by month.
    first_seen = (pd.concat([
        fact.groupby("from_wallet")["ym"].min().rename("first_ym"),
        fact.groupby("to_wallet")["ym"].min().rename("first_ym"),
    ]).groupby(level=0).min())
    new_per_month = first_seen.value_counts()

    monthly["new_wallets"] = monthly["month"].map(new_per_month).fillna(0).astype(int)
    monthly["returning_wallets"] = (
        monthly["monthly_active_wallets"] - monthly["new_wallets"]
    )
    monthly["is_partial"] = False
    monthly["month_label"] = monthly["month"].map(month_label)
    return monthly


# --------------------------------------------------------------------------- #
# function mix
# --------------------------------------------------------------------------- #

def build_function_breakdown(clean_tx: pd.DataFrame) -> dict:
    """Protocol Activity Mix: transaction count by decoded contract function.

    Grouped by the function *name prefix* rather than the full signature, so the
    two Aave `supply()` variants (V2 pool 0xe9c7359c and V3 pool 0x617ba037) and
    the two `withdraw()` variants land in one bucket - they are the same
    user-facing action. The exact per-signature counts are kept in "detail".
    """
    fn = clean_tx["function_name"].fillna("(undecoded)").astype(str).str.strip()
    # "supply(address asset, ...)" -> "supply"; "" -> "(undecoded)"
    prefix = fn.str.split("(").str[0].replace("", "(undecoded)")

    total = len(clean_tx)
    counts = prefix.value_counts()

    detail = [
        {
            "function": name,
            "tx_count": int(count),
            "pct_of_total": round(100.0 * count / total, 2),
        }
        for name, count in counts.items()
    ]

    headline, other = [], 0
    for row in detail:
        if row["pct_of_total"] >= OTHER_BUCKET_THRESHOLD_PCT:
            headline.append(row)
        else:
            other += row["tx_count"]

    mix = list(headline)
    if other:
        mix.append({
            "function": "Other",
            "tx_count": int(other),
            "pct_of_total": round(100.0 * other / total, 2),
        })

    flash = counts[[n for n in counts.index if "flashloan" in n.lower()]].sum()
    liquidations = int(counts.get("liquidationCall", 0))

    return {
        "total_transactions": int(total),
        "grouping_rule": (
            "Grouped by contract function name prefix, not the full signature - "
            "supply() covers both 0x617ba037 (V3 pool) and 0xe9c7359c (V2 GHO), "
            "and withdraw() covers 0x69328dec and 0x3ccfd60b."
        ),
        "other_bucket_threshold_pct": OTHER_BUCKET_THRESHOLD_PCT,
        "mix": mix,
        "detail": detail,
        "headline_metrics": {
            "median_gas_used": int(clean_tx["gas_used"].median()),
            "flash_loan_tx_count": int(flash),
            "flash_loan_rate_pct": round(100.0 * float(flash) / total, 2),
            "liquidation_call_count": liquidations,
            "liquidation_call_rate_pct": round(100.0 * liquidations / total, 2),
            "undecoded_tx_count": int(counts.get("(undecoded)", 0)),
        },
    }


# --------------------------------------------------------------------------- #
# wallet detail (drawer)
# --------------------------------------------------------------------------- #

def build_wallet_detail(fact: pd.DataFrame, clean_tx: pd.DataFrame,
                        dim: pd.DataFrame) -> dict:
    """Top wallets by transaction count + their most recent events.

    function_name/method_id only exist in transactions_clean.csv, so the two
    frames are joined on tx_hash. The drawer deliberately does NOT show token
    amounts: user wallets carry no ERC-20 value (see limitations #3), so an
    amount column would be a column of zeros pretending to be data.
    """
    decoded = clean_tx.set_index("tx_hash")[["function_name", "method_id"]]
    pool_mask = fact["from_wallet"].str.lower() == POOL_CONTRACT
    users = fact[~pool_mask].copy()

    top = users["from_wallet"].value_counts().head(DRAWER_WALLET_COUNT).index
    seg = dim.set_index("wallet_address")
    ts = fact.sort_values("timestamp", ascending=False)

    wallets = []
    for rank, address in enumerate(top, start=1):
        events = ts[ts["from_wallet"] == address].head(DRAWER_EVENT_COUNT)
        events = events.join(decoded, on="tx_hash")
        wallets.append({
            "rank": rank,
            "address": address,
            "address_short": short_addr(address),
            "explorer_url": POOLYGONSCAN_ADDR + address,
            "segment": clean(seg.at[address, "wallet_segment"])
            if address in seg.index else None,
            "total_transactions": int(len(ts[ts["from_wallet"] == address])),
            "first_seen_date": clean(seg.at[address, "first_seen_date"])
            if address in seg.index else None,
            "last_seen_date": clean(seg.at[address, "last_seen_date"])
            if address in seg.index else None,
            "total_volume_pol": round(
                float(seg.at[address, "total_volume"]), 6
            ) if address in seg.index else 0.0,
            "recent_events": [
                {
                    "tx_hash": row.tx_hash,
                    "explorer_url": POOLYGONSCAN_TX + row.tx_hash,
                    "block_number": int(row.block_number),
                    "timestamp": clean(row.timestamp),
                    "function_name": clean(row.function_name) or "(undecoded)",
                    "method_id": clean(row.method_id),
                    "status": int(row.status),
                    "gas_cost_usd": round(float(row.gas_cost_usd), 6),
                    "value_native": round(float(row.value_native), 6),
                    "is_whale_transaction": bool(row.is_whale_transaction),
                }
                for row in events.itertuples()
            ],
        })

    return {
        "note": (
            "No token amounts are shown: only 38 of 158,916 transactions carry "
            "native value and user positions move as ERC-20 aTokens, so an "
            "amount column would be a column of zeros. See limitations #3."
        ),
        "wallets": wallets,
    }


# --------------------------------------------------------------------------- #
# findings / recommendations / limitations (transcribed, not recomputed)
# --------------------------------------------------------------------------- #

def build_findings() -> list[dict]:
    """Verbatim from outputs/reports/business_recommendations.md section 3.

    Transcribed, not regenerated - these are analyst conclusions with business
    impact attached. Numbers must match the report exactly.
    """
    return [
        {
            "id": "3.1",
            "title": "Activity collapsed after a single April spike",
            "business_impact": (
                "The protocol is not growing. Any growth narrative built on the "
                "April number (12,407 MAU, ~49.4K txs, 4,874 txs on a single "
                "peak day) is false advertising to leadership and stakeholders."
            ),
            "evidence": (
                "outputs/figures/01_daily_active_wallets.png, "
                "02_new_vs_returning_monthly.png; notebooks/01_eda.ipynb section 1"
            ),
            "confidence": "High",
            "confidence_note": "Simple COUNT window queries over the full clean ledger; no estimation involved.",
            "metrics": [
                {"label": "Peak MAU (Apr 2026)", "value": "12,407"},
                {"label": "Partial MAU (Sep 2026, to 09-05)", "value": "716"},
                {"label": "Peak single day", "value": "4,874 txs"},
                {"label": "Month-over-month change", "value": "-94%"},
            ],
        },
        {
            "id": "3.2",
            "title": "The surviving base is one-shot-heavy but maturing",
            "business_impact": (
                "79.5% of the 18,968 distinct senders transacted in a single "
                "month; yet new-wallet share fell 100% -> ~21%, so the smaller "
                "later base is increasingly retained users. The funnel is "
                "acquisition-heavy with a thin loyal core - re-engagement, not "
                "acquisition, is where growth effort pays."
            ),
            "evidence": (
                "outputs/figures/02_new_vs_returning_monthly.png, "
                "03_tx_per_wallet_dist.png; notebooks/01_eda.ipynb section 1"
            ),
            "confidence": "High",
            "confidence_note": "Direct counts from wallets.first_seen_date / transactions.",
            "metrics": [
                {"label": "Single-month senders", "value": "79.5%"},
                {"label": "Distinct senders", "value": "18,968"},
                {"label": "New-wallet share Mar -> Sep", "value": "100% -> ~21%"},
            ],
        },
        {
            "id": "3.3",
            "title": "Extreme user concentration; native value is degenerate",
            "business_impact": (
                "Top 1% of user wallets (~190) drive ~49% of transactions; the "
                "busiest user (0x1b54...b7f0) executed 8,054 txs. Meanwhile ~100% "
                "of native value sits in the Pool contract itself (one 1,000-POL "
                "supply tx dominates; median tx value = 0 POL). Dependency risk is "
                "real and unmitigated; value-based whale lists are currently "
                "meaningless at the Pool level."
            ),
            "evidence": (
                "outputs/figures/10_concentration.png, 11_top_10_wallets.png, "
                "05_value_distribution_whale.png; notebooks/01_eda.ipynb section 4"
            ),
            "confidence": "Medium",
            "confidence_note": "Activity concentration is a direct computation (High); the automated-agents reading of the power users is inferred from timing/behaviour, not proven (see 3.5).",
            "metrics": [
                {"label": "Top 1% share of transactions", "value": "~49%"},
                {"label": "Busiest wallet", "value": "8,054 txs"},
                {"label": "Txs carrying native value", "value": "38 of 158,916"},
            ],
        },
        {
            "id": "3.4",
            "title": "Costs are negligible; the native value signal is not meaningful",
            "business_impact": (
                "~$0.0073/transaction, ~$1,158 total: operating on Polygon is "
                "cheap for users and for the protocol. The gas-as-%-of-value ratio "
                "and the value x gas correlation (r = -0.05, p = 0.75, n = 38) are "
                "noise, because value is carried as aTokens, not native POL. Fee "
                "economics must be re-measured at function level before Finance "
                "can price or campaign on them."
            ),
            "evidence": (
                "outputs/figures/07_gas_cost_trend.png, 08_gas_pct_of_value.png, "
                "09_value_vs_gas_scatter.png; notebooks/01_eda.ipynb section 3"
            ),
            "confidence": "High",
            "confidence_note": "High for the cost numbers (gas_used x gas_price with the POL-USD feed); the interpretation that value KPIs are degenerate is well-evidenced but reflects a known data-model constraint (Medium).",
            "metrics": [
                {"label": "Cost per transaction", "value": "~$0.0073"},
                {"label": "Total gas cost", "value": "~$1,158"},
                {"label": "Value x gas correlation", "value": "r = -0.05, p = 0.75"},
            ],
        },
        {
            "id": "3.5",
            "title": "Activity is timed like orchestrated/bot usage",
            "business_impact": (
                "Activity clusters at 12:00 UTC on Thursdays inside a narrow band "
                "of mid-week hours, with near-zero weekend traffic. Consistent "
                "with automated agents/aggregators rather than organic retail. "
                "Bots distort MAU, waste measurement, and concentrate risk; they "
                "are also a segment Operations can serve deliberately."
            ),
            "evidence": "outputs/figures/06_hour_dow_heatmap.png; notebooks/01_eda.ipynb section 2",
            "confidence": "Medium",
            "confidence_note": "The pattern is certain; why is circumstantial (no wallet-fingerprinting was done).",
            "metrics": [
                {"label": "Peak cell", "value": "12:00 UTC, Thursday"},
                {"label": "Transactions in peak cell", "value": "1,789"},
                {"label": "Weekend traffic", "value": "near zero"},
            ],
        },
        {
            "id": "3.6",
            "title": "Retention is poor, and the acquisition spike cohort retained almost no one",
            "business_impact": (
                "Average month-1 retention = 21.1%. The April cohort (11,094 "
                "wallets - 58% of the entire base) retained just 4.7% after one "
                "month; the March cohort held 47%. Retention, not acquisition, is "
                "the highest-leverage intervention."
            ),
            "evidence": (
                "outputs/figures/cohort_retention_heatmap.png; "
                "dashboard/data_extracts/cohort_retention_matrix.csv; "
                "docs/customer_intelligence_findings.md"
            ),
            "confidence": "High",
            "confidence_note": "Cohort/segment counts recomputed from wallets.first_seen_date and per-month activity; every wallet assigned exactly one segment (18,981/18,981, 0 gaps).",
            "metrics": [
                {"label": "Average month-1 retention", "value": "21.1%"},
                {"label": "April cohort size", "value": "11,094 (58% of base)"},
                {"label": "April cohort month-1 retention", "value": "4.7%"},
                {"label": "March cohort month-1 retention", "value": "47%"},
            ],
        },
    ]


def build_recommendations() -> list[dict]:
    """Verbatim from outputs/reports/business_recommendations.md section 4."""
    return [
        {
            "id": "R-1",
            "title": "Attack the month-1 retention cliff",
            "priority": "High",
            "category": "Retention",
            "owner": "Product Manager",
            "maps_to": ["BR-02", "BR-05"],
            "rationale": (
                "Finding 3.6: month-1 retention averages 21.1%; the single "
                "sharpest drop in the entire funnel is month 0 -> 1. New + "
                "Emerging users (714 wallets) and the High-Value Dormant segment "
                "(3,010) are the cheapest to win back."
            ),
            "next_step": (
                "Within 30 days, ship a first-supply onboarding flow (education + "
                "deposit) targeting New/Emerging wallets and launch a reactivation "
                "campaign over High-Value Dormant + Frequent Users (6,257 "
                "wallets). Success metric: average month-1 retention from 21.1% "
                "toward 30%, and >10% of the reactivated dormant segment active "
                "again within 90 days."
            ),
        },
        {
            "id": "R-2",
            "title": "Formalize the concentration / dependency risk",
            "priority": "High",
            "category": "Risk",
            "owner": "Operations",
            "maps_to": ["BR-04", "BR-07"],
            "rationale": (
                "Findings 3.3 + 3.5: top 1% (~190 wallets) = ~49% of "
                "transactions; power users look automated. One automated account "
                "departing is a material activity drop."
            ),
            "next_step": (
                "Add a weekly dependency metric to the dashboard - the top-1% "
                "share of transaction count with a rule: alert if it exceeds 60% "
                "of any 7-day window (it is ~49% today). Build and maintain a "
                "key-account list for the ~50 highest-activity wallets (they are "
                "already in dim_wallets.csv), and classify them agent vs retail so "
                "the dependency number is intelligible."
            ),
        },
        {
            "id": "R-3",
            "title": "Fix the value-measurement gap before any pricing/campaigning",
            "priority": "High",
            "category": "Measurement",
            "owner": "Finance",
            "maps_to": ["BR-03", "BR-04"],
            "rationale": (
                "Findings 3.3 + 3.4: native value is degenerate at the Pool "
                "level, so KPI-03/04/07 and all volume-by-segment visuals are not "
                "economically real. You cannot price, fee, or market on numbers "
                "that read ~$0."
            ),
            "next_step": (
                "Extend the warehouse with function-level call decoding "
                "(deposit/borrow/withdraw/repay amounts) and load a real-time "
                "POL-USD + aToken price reference (the current POL-USD feed is a "
                "single static value captured at load time). Recompute the "
                "monetary KPIs and the HVA/HVD segment value splits from the "
                "decoded values, not Pool-level value_native."
            ),
        },
        {
            "id": "R-4",
            "title": "Reframe the growth narrative around a durable-base KPI",
            "priority": "Medium",
            "category": "Executive",
            "owner": "Executive / Leadership",
            "maps_to": ["BR-01"],
            "rationale": (
                "Findings 3.1 + 3.2: the April spike was 58% of the base and "
                "retained 4.7%; MAU as currently presented overstates health."
            ),
            "next_step": (
                "Add a retained-core measure to the dashboard - wallets active in "
                ">=2 of the last 3 months (computed from dim_wallets "
                "first_seen_date/last_seen_date) - as the second headline card "
                "next to MAU, and set a growth target on it. Report these two "
                "numbers together so a spike cannot masquerade as growth."
            ),
        },
        {
            "id": "R-5",
            "title": "Keep Polygon as the operating chain; re-measure cost economics after R-3",
            "priority": "Low",
            "category": "Cost",
            "owner": "Finance",
            "maps_to": ["BR-03"],
            "rationale": (
                "Finding 3.4: ~$0.0073/tx validates the cost side of the Polygon "
                "thesis. There is no cost-discount lever to pull; the economics "
                "work is measurement, not migration."
            ),
            "next_step": (
                "After R-3 lands, recompute gas-as-% of transaction value from "
                "function-level values, and set an efficiency threshold (e.g. gas "
                "<= 0.5% of transferred value by function) that surfaces in the "
                "cost page. Until then, stop reporting the degenerate ratio."
            ),
        },
        {
            "id": "R-6",
            "title": "Build explicit bot/anomaly detection into the risk log",
            "priority": "High",
            "category": "Risk",
            "owner": "Risk / Compliance",
            "maps_to": ["BR-07"],
            "rationale": (
                "Finding 3.5: a tight 12:00-UTC Thursday cluster with near-zero "
                "weekends is characteristic of orchestrated activity; 2.84% of "
                "transactions (4,514) already fail. Risk should see this "
                "explicitly, not infer it."
            ),
            "next_step": (
                "Add a detection rule to the anomaly log (flagged_transactions.csv "
                "pipeline): flag wallets whose activity is >=90% inside the "
                "observed peak hour-DOW cluster, and alert on per-wallet daily "
                "rate spikes. This turns the F5 timing observation into an "
                "operational, queryable risk signal."
            ),
        },
    ]


def build_limitations() -> list[dict]:
    """Verbatim summary of docs/limitations.md (11 numbered entries)."""
    return [
        {
            "id": "L-1",
            "title": "Scope: one contract, one chain, one six-month window",
            "what": "Every transaction against the Aave V3 Pool on Polygon between 2026-03-09 and 2026-09-05 (181 days). September is partial (through 09-05; 716 active wallets).",
            "why_it_matters": "Findings describe this contract on this chain in this window. They do not generalize to other Aave markets, other chains, or other periods. No forecast is attempted.",
            "mitigation": "Every number is scoped to this window and the partial September is flagged wherever it is cited.",
        },
        {
            "id": "L-2",
            "title": "Wallet addresses are not people",
            "what": "'Active wallet' counts distinct addresses, not unique humans. One person can control many wallets; one wallet can be an automated agent.",
            "why_it_matters": "MAU, segmentation, and retention figures over- or understate the true user base depending on the multi-wallet/agent mix.",
            "mitigation": "The report uses 'wallet' and 'user' with that caveat in mind; the bot-like timing finding is explicitly hedged at Medium confidence because no wallet-fingerprinting was done.",
        },
        {
            "id": "L-3",
            "title": "Native value is degenerate - the central measurement gap",
            "what": "Aave positions move as ERC-20 aTokens, not as native POL. Pool-level native value attaches almost entirely to the Pool contract itself (1,065.51 POL received, effectively gas-refund mechanics), so wallets.total_volume and transactions.value_native are ~$0 for real users. Only 38 of 158,916 transactions carry native value; the median transaction value is 0 POL.",
            "why_it_matters": "Monetary KPIs (KPI-03/04/07), volume-by-segment, and value-based whale lists read near zero and would mislead anyone who takes them at face value.",
            "mitigation": "Recommended fix (R-3) is function-level decoding of supply/borrow/withdraw/repay calls plus a real-time POL/USD and aToken price reference. Until then value figures are reported as degenerate and the RFM segments are described as R x F driven.",
            "is_headline": True,
        },
        {
            "id": "L-4",
            "title": "Token transfers are mostly spam and un-priced",
            "what": "156 of 163 token transfers are unverified spam airdrops. The warehouse stores no token decimals or prices for the remaining transfers.",
            "why_it_matters": "Token-level value cannot close the monetary gap; spam transfers are correctly excluded from activity and retention, but their parent transactions are not part of the Pool ledger by design.",
            "mitigation": "Spam is flagged (is_spam) and excluded from monetary fallback and activity; the residual gap is owned by R-3.",
        },
        {
            "id": "L-5",
            "title": "Failed, self, and zero-value transactions are counted",
            "what": "4,514 of 158,916 transactions (2.84%) have status = 0. Failed, self, and zero-value rows are flagged - never dropped.",
            "why_it_matters": "Raw activity counts include failed attempts, slightly inflating demand-side numbers.",
            "mitigation": "They are isolated in flagged_transactions.csv and surfaced as an anomaly/risk input (BR-07) rather than silently hidden.",
        },
        {
            "id": "L-6",
            "title": "Automated / bot activity may inflate the base",
            "what": "The busiest wallet executed 8,054 transactions; activity clusters at 12:00 UTC on Thursdays with near-zero weekends. The Pool contract is the recipient of every transaction and is set aside only for user-level concentration analysis.",
            "why_it_matters": "MAU and transaction counts overstate organic retail usage; top-wallet dependency risk is real.",
            "mitigation": "The timing finding is labeled Medium confidence; bot addresses were not de-duplicated (flagged as future work in R-6).",
        },
        {
            "id": "L-7",
            "title": "Retention is transaction-based",
            "what": "A wallet is 'active' in a month only if it transacted. A holder or borrower with no on-chain activity that month is counted as inactive; native value is not a retention signal here.",
            "why_it_matters": "Month-1 retention (21.1% average) understates a value-holding base that interacts rarely; cohort results are engagement, not deposits.",
            "mitigation": "The definition is stated in kpi_framework.md (KPI-02) and methodology.md; real deposit-value retention requires R-3.",
        },
        {
            "id": "L-8",
            "title": "Cost figures use a daily price reference, and the ratio is meaningless",
            "what": "gas_cost_usd applies the daily CoinGecko POL/USD price (100% coverage in window). The gas-as-%-of-value measure divides gas by native value, which is degenerate; the value x gas correlation (r = -0.05, p = 0.78) is reported as non-meaningful.",
            "why_it_matters": "Absolute cost (~$0.0073/tx, ~$1,158 total) is reliable; any ratio or correlation that depends on native value is not.",
            "mitigation": "The report says this explicitly (Finding 3.4) and recommends re-measuring fee economics at function level after R-3.",
        },
        {
            "id": "L-9",
            "title": "Data-quality constraints from the V2 API",
            "what": "token_transfers.transfer_id is a surrogate (tx_hash + '_' + seq) because the V2 API omits logIndex; tokentx parent transactions are not in the Pool ledger; addresses are normalized to lowercase without case-checksum validation.",
            "why_it_matters": "Minor join/audit friction, no impact on counts.",
            "mitigation": "Documented in data_dictionary.md; referential integrity is verified on load (0 orphans).",
        },
        {
            "id": "L-10",
            "title": "Environment and reproducibility dependencies",
            "what": "The local PostgreSQL server runs in WSL2 and requires jit=off (missing LLVM runtime); fact_transactions.csv is large and gitignored; the .pbix is gitignored.",
            "why_it_matters": "Full reproduction needs a reachable PostgreSQL instance and the local Power BI files; the GitHub repo carries code + small extracts, not the raw data or the workbook.",
            "mitigation": "methodology.md section 6 gives the exact run order. The webapp itself needs none of this - it reads committed static JSON.",
        },
        {
            "id": "L-11",
            "title": "No off-chain context",
            "what": "Price feeds are market references, not user-reported intent; no marketing/financial events, support tickets, or survey data are available to explain why activity moved (e.g. the April 8-14 spike is inferred to be a promotional/airdrop event from on-chain timing alone).",
            "why_it_matters": "Causal explanations in the reports are hypotheses, not verified business events.",
            "mitigation": "The findings that rest on inference are labeled Medium confidence and competing explanations are noted (e.g. bot activity in Finding 3.5).",
        },
    ]


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"exporting webapp JSON to {OUT_DIR.relative_to(PROJECT_ROOT)}\n")

    fact = pd.read_csv(require(EXTRACTS / "fact_transactions.csv"))
    dim = pd.read_csv(require(EXTRACTS / "dim_wallets.csv"))
    daily = pd.read_csv(require(EXTRACTS / "daily_kpi_summary.csv"))
    segments = pd.read_csv(require(EXTRACTS / "rfm_segment_summary.csv"))
    cohorts = pd.read_csv(require(EXTRACTS / "cohort_retention_matrix.csv"))
    clean_tx = pd.read_csv(
        require(PROCESSED / "transactions_clean.csv"),
        usecols=["tx_hash", "function_name", "method_id", "gas_used"],
    )

    fact["from_wallet"] = fact["from_wallet"].str.lower()
    fact["to_wallet"] = fact["to_wallet"].str.lower()
    dim["wallet_address"] = dim["wallet_address"].str.lower()
    fact["timestamp"] = pd.to_datetime(fact["timestamp"], utc=True, format="mixed")

    monthly = build_monthly_activity(fact)
    total_tx = int(len(fact))
    total_gas_usd = round(float(daily["total_gas_usd"].sum()), 2)
    total_wallets = int(len(dim))
    date_start = str(daily["event_date"].min())
    date_end = str(daily["event_date"].max())

    # --- 1. kpi_summary -------------------------------------------------- #
    peak = monthly.loc[monthly["monthly_active_wallets"].idxmax()]
    current = monthly.iloc[-1]
    user_senders = fact[fact["from_wallet"] != POOL_CONTRACT]["from_wallet"]
    whale_n = max(1, int(round(user_senders.nunique() * 0.01)))
    whale_share = 100.0 * user_senders.value_counts().head(whale_n).sum() / len(
        fact[fact["from_wallet"] != POOL_CONTRACT]
    )
    m1 = pd.to_numeric(cohorts["1"], errors="coerce").dropna()

    write_json("kpi_summary.json", {
        "monthly_active_wallets_peak": int(peak["monthly_active_wallets"]),
        "monthly_active_wallets_peak_month": str(peak["month"]),
        "monthly_active_wallets_peak_month_label": str(peak["month_label"]),
        "current_partial_mau": int(current["monthly_active_wallets"]),
        "current_partial_mau_month": str(current["month"]),
        "current_partial_mau_is_partial": True,
        "mau_includes_pool_contract": True,
        "total_wallets": total_wallets,
        "total_transactions": total_tx,
        "total_contracts": 159,
        "total_token_transfers": 163,
        "date_range": {
            "start": date_start,
            "end": date_end,
            "days": int(len(daily)),
        },
        "whale_concentration_pct": round(float(whale_share), 1),
        "whale_wallet_count": whale_n,
        "whale_definition": (
            f"Top {whale_n} user wallets (1% of {int(user_senders.nunique())} "
            "distinct senders) by transaction count, excluding the Pool contract"
        ),
        "avg_month1_retention_pct": round(float(m1.mean()), 1),
        "avg_gas_cost_usd": round(total_gas_usd / total_tx, 5),
        "total_gas_cost_usd": total_gas_usd,
        "failed_tx_pct": round(100.0 * int((fact["status"] == 0).sum()) / total_tx, 2),
        "failed_tx_count": int((fact["status"] == 0).sum()),
        "tx_carrying_native_value": int((fact["value_native"] > 0).sum()),
        "total_volume_pol": round(float(fact["value_native"].sum()), 6),
        "value_caveat": (
            "Native value is degenerate at the Pool level - see limitations L-3. "
            "Aave positions move as ERC-20 aTokens, so value_native reads ~0 for "
            "real users and ~100% of received POL sits in the Pool contract."
        ),
    })

    # --- 2. monthly_activity --------------------------------------------- #
    write_json("monthly_activity.json", records(monthly[[
        "month", "month_label", "monthly_active_wallets", "new_wallets",
        "returning_wallets", "tx_count", "failed_tx_count", "whale_tx_count",
        "total_gas_usd", "total_volume_pol",
    ]]))

    # --- 3. daily_activity ----------------------------------------------- #
    # active_wallets -> dau on purpose: daily-distinct is a different (smaller)
    # number than the monthly-distinct MAU above and the two must never be
    # shown under the same unqualified label.
    daily_out = daily.rename(columns={"active_wallets": "dau"})[[
        "event_date", "dau", "new_wallets", "tx_count", "failed_tx_count",
        "whale_tx_count", "total_volume_pol", "total_gas_usd",
    ]].copy()
    daily_out["avg_gas_cost_usd"] = (
        daily_out["total_gas_usd"] / daily_out["tx_count"].replace(0, pd.NA)
    ).round(5)
    write_json("daily_activity.json", {
        "definitions": {
            "dau": "Distinct wallets (from_wallet union to_wallet) on that single date. Not comparable to the monthly MAU in kpi_summary.json.",
            "new_wallets": "Wallets whose first appearance in the whole ledger falls on that date.",
        },
        "days": records(daily_out),
    })

    # --- 4. segment_summary ---------------------------------------------- #
    seg_out = segments.rename(columns={
        "pct_wallets": "pct_of_wallets",
        "pct_volume": "pct_of_volume",
        "avg_transactions_per_wallet": "avg_transactions",
    }).copy()
    seg_out["wallet_count"] = seg_out["wallet_count"].astype(int)
    seg_out["pct_of_volume"] = seg_out["pct_of_volume"].astype(float)
    seg_out["volume_caveat"] = (
        "pct_of_volume is degenerate: ~100% of native value sits in the Pool "
        "contract, so it concentrates in one segment. See limitations L-3."
    )
    write_json("segment_summary.json", {
        "total_wallets": total_wallets,
        "note": "Monetary is degenerate, so segments are effectively Recency x Frequency driven.",
        "segments": records(seg_out[[
            "segment", "wallet_count", "pct_of_wallets", "pct_of_volume",
            "avg_transactions",
        ]]),
    })

    # --- 5. cohort_retention --------------------------------------------- #
    # Column names in the source CSV are "0".."6", which are not valid Python
    # identifiers - itertuples would rename them, so index the dict directly.
    month_cols = [str(m) for m in range(7)]
    cohort_rows = []
    for row in cohorts.to_dict(orient="records"):
        cohort_rows.append({
            "cohort_month": row["cohort_month"],
            "cohort_month_label": month_label(row["cohort_month"]),
            "cohort_size": int(row["cohort_size"]),
            "retention": [
                None if pd.isna(row[c]) else float(row[c]) for c in month_cols
            ],
        })
    write_json("cohort_retention.json", {
        "definition": (
            "A wallet is retained in month M if it transacted with the Pool in "
            "that calendar month. null = the cohort has not reached that month yet."
        ),
        "avg_month1_retention_pct": round(float(m1.mean()), 1),
        "cohorts": cohort_rows,
    })

    # --- 6. top_wallets -------------------------------------------------- #
    pool_row = dim[dim["wallet_address"] == POOL_CONTRACT]
    user_dim = dim[dim["wallet_address"] != POOL_CONTRACT].copy()
    top = user_dim.nlargest(TOP_WALLET_COUNT, "total_transactions").copy()
    top["share_pct"] = (100.0 * top["total_transactions"] / total_tx).round(2)
    top["address_short"] = top["wallet_address"].map(short_addr)
    top["explorer_url"] = top["wallet_address"].map(lambda a: POOLYGONSCAN_ADDR + a)
    write_json("top_wallets.json", {
        "note": "Top user wallets by transaction count. The Pool contract is excluded - it is #1 by raw count because it is the recipient of every transaction, but it is not a user.",
        "protocol_contract": {
            "address": POOL_CONTRACT,
            "address_short": POOL_SHORT,
            "label": "Aave V3 Pool (target contract)",
            "total_transactions": int(pool_row["total_transactions"].iloc[0])
            if len(pool_row) else total_tx,
            "total_volume_pol": round(float(pool_row["total_volume"].iloc[0]), 6)
            if len(pool_row) else round(float(fact["value_native"].sum()), 6),
            "explorer_url": POOLYGONSCAN_ADDR + POOL_CONTRACT,
            "is_contract": True,
        },
        "wallets": [
            {
                "address": r["wallet_address"],
                "address_short": r["address_short"],
                "explorer_url": r["explorer_url"],
                "segment": r["wallet_segment"],
                "total_transactions": int(r["total_transactions"]),
                "share_pct": float(r["share_pct"]),
                "first_seen_date": r["first_seen_date"],
                "last_seen_date": r["last_seen_date"],
                "is_contract": bool(r["is_contract"]),
            }
            for r in records(top[[
                "wallet_address", "address_short", "explorer_url",
                "wallet_segment", "total_transactions", "share_pct",
                "first_seen_date", "last_seen_date", "is_contract",
            ]])
        ],
    })

    # --- 7. hourly_activity ---------------------------------------------- #
    grid = [[0] * 24 for _ in range(7)]
    for (dow, hour), n in fact.groupby(["weekday", "hour_utc"]).size().items():
        grid[int(dow)][int(hour)] = int(n)
    peak_dow, peak_hour = max(
        ((d, h) for d in range(7) for h in range(24)),
        key=lambda dh: grid[dh[0]][dh[1]],
    )
    write_json("hourly_activity.json", {
        "definition": "Transaction count by UTC hour of day (0-23) and day of week (0 = Sunday), across the full window.",
        "hours": list(range(24)),
        "weekdays": WEEKDAYS,
        "weekdays_long": WEEKDAY_LONG,
        "grid": grid,
        "peak": {
            "weekday": peak_dow,
            "weekday_label": WEEKDAY_LONG[peak_dow],
            "hour": peak_hour,
            "hour_label": f"{peak_hour:02d}:00 UTC",
            "tx_count": grid[peak_dow][peak_hour],
        },
        "finding": (
            "Activity clusters at 12:00 UTC on Thursdays inside a narrow band of "
            "mid-week hours, with near-zero weekend traffic - consistent with "
            "automated agents rather than organic retail (Finding 3.5)."
        ),
    })

    # --- 8. function_breakdown ------------------------------------------- #
    write_json("function_breakdown.json", build_function_breakdown(clean_tx))

    # --- 9. wallet_detail ------------------------------------------------ #
    write_json("wallet_detail.json", build_wallet_detail(fact, clean_tx, dim))

    # --- 10-11. findings / recommendations -------------------------------- #
    write_json("findings.json", {
        "source": "outputs/reports/business_recommendations.md section 3",
        "findings": build_findings(),
    })
    write_json("recommendations.json", {
        "source": "outputs/reports/business_recommendations.md section 4",
        "recommendations": build_recommendations(),
    })

    # --- 12. limitations ------------------------------------------------- #
    write_json("limitations.json", {
        "source": "docs/limitations.md",
        "net_effect": (
            "The engagement-side numbers (activity, retention, segments, "
            "concentration) are reliable and computed directly from clean ledger "
            "data. The value-side numbers are structurally unable to answer "
            "monetary questions at Pool level - fixing this is the single "
            "highest data priority in the recommendations (R-3)."
        ),
        "limitations": build_limitations(),
    })

    # --- 13. pipeline_meta ----------------------------------------------- #
    extraction = json.loads(require(RAW / "extraction_log.json").read_text())
    cleaning = json.loads(require(PROCESSED / "cleaning_log.json").read_text())
    write_json("pipeline_meta.json", {
        "chain": "Polygon PoS",
        "chain_id": 137,
        "protocol": "Aave V3 Pool",
        "contract_address": POOL_CONTRACT,
        "contract_label": POOL_SHORT,
        "api": "Etherscan V2 (Polygonscan) - account.txlist + account.tokentx",
        "price_feed": cleaning.get("gas_cost_usd_source", "coingecko_pol_usd"),
        "date_range": {"start": date_start, "end": date_end},
        "block_range": {
            "start": extraction.get("start_block"),
            "end": extraction.get("end_block"),
        },
        "extraction": extraction,
        "cleaning": cleaning,
        "warehouse": {
            "engine": "PostgreSQL 16",
            "schema": "blockchain_bi",
            "tables": ["wallets", "transactions", "contracts", "token_transfers"],
            "row_counts": {
                "wallets": total_wallets,
                "transactions": total_tx,
                "contracts": 159,
                "token_transfers": 163,
            },
        },
        "webapp": {
            "framework": "Next.js (App Router) + TypeScript + Tailwind CSS + Recharts",
            "data_strategy": "Static JSON read at build time - no database, no runtime data fetching",
            "source_script": "src/analysis/export_for_webapp.py",
        },
    })

    print(f"\nall {len(list(OUT_DIR.glob('*.json')))} payloads written to "
          f"{OUT_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
