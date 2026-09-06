"""Cohort retention analysis for Aave V3 Pool wallets (Part 5B).

Assigns each wallet to a monthly cohort based on the month of its first
transaction (wallets.first_seen_date), then for each cohort computes the
% of wallets still active (>=1 transaction) in each of the following months
(month 0 .. month 6, as far as the pull window allows).

"Active" is defined on transactions only, consistent with KPI-02 in
docs/kpi_framework.md; token transfers are excluded from the activity
definition because 156/163 of them are unverified spam airdrops.

Outputs:
  * data/processed/cohort_retention.csv        - wide matrix + cohort_size
  * outputs/figures/cohort_retention_heatmap.png - annotated seaborn heatmap
Prints the full matrix and the average month-1 retention (headline KPI).

Usage:
    python src/analysis/cohort_retention.py
"""

import os
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
import sqlalchemy as sa
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
FIG_DIR = PROJECT_ROOT / "outputs" / "figures"

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set in .env")

# Disable query JIT: the local WSL2 PostgreSQL server is missing the LLVM
# runtime, so complex analytical queries fail with
# "could not load library .../llvmjit.so".
CONNECT_ARGS = {"options": "-c jit=off"}
engine = sa.create_engine(DATABASE_URL, connect_args=CONNECT_ARGS)

COHORT_SQL = """
SELECT wallet_address, date_trunc('month', first_seen_date)::date AS cohort_month
FROM wallets
WHERE first_seen_date IS NOT NULL;
"""

ACTIVITY_SQL = """
SELECT DISTINCT from_wallet AS wallet, date_trunc('month', timestamp)::date AS act_month
FROM transactions
UNION
SELECT DISTINCT to_wallet, date_trunc('month', timestamp)::date
FROM transactions;
"""


def month_diff(a: pd.Series, b: pd.Series) -> pd.Series:
    """Calendar months between two datetime64 series (a - b)."""
    return (a.dt.year - b.dt.year) * 12 + (a.dt.month - b.dt.month)


def main() -> None:
    os.makedirs(DATA_PROCESSED, exist_ok=True)
    os.makedirs(FIG_DIR, exist_ok=True)

    print("loading cohorts and activity months ...")
    df_w = pd.read_sql(sa.text(COHORT_SQL), engine)
    df_a = pd.read_sql(sa.text(ACTIVITY_SQL), engine)

    df_w["cohort_month"] = pd.to_datetime(df_w["cohort_month"])
    df_a["act_month"] = pd.to_datetime(df_a["act_month"])
    df_w = df_w.rename(columns={"wallet_address": "wallet"})

    cohort_size = df_w.groupby("cohort_month")["wallet"].size()

    merged = df_a.merge(df_w, on="wallet", how="inner")
    merged["offset"] = month_diff(merged["act_month"], merged["cohort_month"])
    merged = merged[merged["offset"] >= 0]

    active = (
        merged.groupby(["cohort_month", "offset"])["wallet"]
        .nunique()
        .unstack(fill_value=0)
    )
    retention = active.div(cohort_size, axis=0) * 100.0

    # contiguous month columns 0 .. max observed offset
    max_offset = int(retention.columns.max())
    retention = retention.reindex(columns=range(max_offset + 1))

    # Mark cells "no data yet" (cohort hasn't reached that month) as NaN so
    # they are not confused with genuine 0% retention.
    max_period = df_a["act_month"].max().to_period("M")
    cohort_periods = pd.PeriodIndex(retention.index, freq="M")
    for i, cohort in enumerate(retention.index):
        cutoff = (max_period - cohort_periods[i]).n  # months this cohort can reach
        retention.iloc[i, [o for o in retention.columns if o > cutoff]] = pd.NA

    # label axes with YYYY-MM strings
    retention.index = pd.to_datetime(retention.index).strftime("%Y-%m")
    cohort_size.index = cohort_size.index.strftime("%Y-%m")

    print("\n=== cohort retention matrix (% of cohort active by month) ===")
    print(retention.round(1).to_string())

    month1 = retention.loc[:, 1].dropna() if 1 in retention.columns else pd.Series(dtype="float64")
    avg_m1 = month1.mean() if not month1.empty else float("nan")
    print(f"\naverage month-1 retention (over {len(month1)} cohorts): "
          f"{avg_m1:.2f}%")

    for m in month1.index:
        print(f"  cohort {m}: month-1 retention = {month1[m]:.2f}%")

    # ---------------- save wide CSV ----------------
    out = retention.round(2).copy()
    out.insert(0, "cohort_size", cohort_size.loc[out.index].values)
    out.index.name = "cohort_month"
    csv_path = DATA_PROCESSED / "cohort_retention.csv"
    out.to_csv(csv_path, float_format="%.2f")
    print(f"saved cohort matrix -> {csv_path}")

    # ---------------- heatmap ----------------
    sns.set_theme(style="whitegrid", palette="colorblind")
    plt.rcParams.update({
        "figure.dpi": 100,
        "savefig.dpi": 150,
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
    })

    plot = retention.loc[retention.index[::-1]]  # oldest cohort on top
    annot = plot.copy().astype(object)
    annot[plot.isna()] = ""

    fig, ax = plt.subplots(figsize=(11, 6))
    sns.heatmap(
        plot, mask=plot.isna(), annot=annot, fmt="", cmap="YlGnBu",
        linewidths=0.5, vmin=0, vmax=100,
        cbar_kws={"label": "Retention % of cohort"}, ax=ax,
    )
    ax.set_title("Cohort retention — Aave V3 Pool on Polygon (Part 5B)")
    ax.set_xlabel("Months after the wallet's first transaction (0 = cohort month)")
    ax.set_ylabel("Cohort (month of first transaction)")

    fig_path = FIG_DIR / "cohort_retention_heatmap.png"
    fig.savefig(fig_path, bbox_inches="tight")
    plt.close(fig)
    print(f"saved heatmap -> {fig_path}")


if __name__ == "__main__":
    main()