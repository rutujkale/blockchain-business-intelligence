# DAX Measures — blockchain_bi Power BI Dashboard

Copy-pasteable Power BI Desktop measures, grouped by dashboard page. All
measures assume the data model and table/column names described below.

## Data model (build these before pasting measures)

Imported tables (from `dashboard/data_extracts/`):

| Table | Key columns |
|---|---|
| `fact_transactions` | `tx_hash`, `from_wallet`, `to_wallet`, `event_date`, `value_native`, `gas_cost_usd`, `gas_cost_native`, `is_whale_transaction`, `status`, `hour_utc`, `weekday` |
| `dim_wallets` | `wallet_address`, `wallet_segment`, `first_seen_date`, `last_seen_date`, `total_transactions`, `total_volume`, `monetary_units`, `recency_days` |
| `cohort_retention_matrix` | `cohort_month`, `cohort_size`, `Month 0` … `Month 6` (rename columns in Power Query: `0`→`Month 0` … `6`→`Month 6`) |
| `rfm_segment_summary` | `segment`, `wallet_count`, `pct_wallets`, `pct_volume`, `avg_transactions_per_wallet` |
| `daily_kpi_summary` | `event_date`, `active_wallets`, `new_wallets`, `tx_count`, `total_volume_pol`, `total_gas_usd`, `whale_tx_count` |

Calculated date table (New Table → DAX):

```dax
DateTable =
CALENDAR(
    MIN( fact_transactions[event_date] ),
    MAX( fact_transactions[event_date] )
)
```

Relationships (Manage Relationships), all single-direction, many→1:

| From | To | Active |
|---|---|---|
| `fact_transactions[event_date]` | `DateTable[Date]` | yes |
| `fact_transactions[from_wallet]` | `dim_wallets[wallet_address]` | yes |
| `fact_transactions[to_wallet]` | `dim_wallets[wallet_address]` | no (use `USERELATIONSHIP`) |
| `daily_kpi_summary[event_date]` | `DateTable[Date]` | yes |

`cohort_retention_matrix` and `rfm_segment_summary` are imported **without
relationships** — they are standalone slice tables (segment/cohort visuals) or
unfiltered KPIs.

> Segment slicers therefore only filter via `dim_wallets`, which is linked to
> `fact_transactions` on `from_wallet`. Tags like "segment" on a visual =
> the *sender's* segment. The `to_segment` column exists in the fact table if
> you need recipient-side views (use `USERELATIONSHIP` + `CALCULATE`, or just
> drop the column into the visual without a relationship).

## Shared base measures (used by every page)

```dax
Total Transactions = COUNTROWS( fact_transactions )

Total Active Wallets =
COUNTROWS(
    DISTINCT(
        UNION(
            VALUES( fact_transactions[from_wallet] ),
            VALUES( fact_transactions[to_wallet] )
        )
    )
)

Total Volume (POL) = SUM( fact_transactions[value_native] )

Average Transaction Value = DIVIDE( [Total Volume (POL)], [Total Transactions] )

Total Gas Cost (USD) = SUM( fact_transactions[gas_cost_usd] )

Total Gas Cost (POL) = SUM( fact_transactions[gas_cost_native] )

Total Whale Transactions =
CALCULATE( COUNTROWS( fact_transactions ), fact_transactions[is_whale_transaction] = TRUE() )

Failed Transaction Count =
CALCULATE( COUNTROWS( fact_transactions ), fact_transactions[status] = 0 )

Distinct Wallets Active in Period =
CALCULATE(
    [Total Active Wallets],
    fact_transactions[event_date] >= MIN( DateTable[Date] ),
    fact_transactions[event_date] <= MAX( DateTable[Date] )
)
```

## Page 1 — Executive Summary

```dax
// KPI cards -----------------------------------------------------------------
Active Wallets KPI = [Distinct Wallets Active in Period]

New Wallets This Period =
CALCULATE(
    COUNTROWS( dim_wallets ),
    dim_wallets[first_seen_date] >= MIN( DateTable[Date] ),
    dim_wallets[first_seen_date] <= MAX( DateTable[Date] )
)

Returning Wallet Count This Period =
VAR _active = [Distinct Wallets Active in Period]
VAR _new    = [New Wallets This Period]
RETURN MAX( _active - _new, 0 )

Returning Wallet Ratio =
DIVIDE( [Returning Wallet Count This Period], [Distinct Wallets Active in Period] )

New vs Returning Ratio (KPI-06) = DIVIDE( [New Wallets This Period], [Returning Wallet Count This Period] )

Total Volume KPI = [Total Volume (POL)]

Total Gas Cost KPI = [Total Gas Cost (USD)]

// Whale concentration (Part 4 finding echoed; volume version is degenerate --
// see findings doc: only the Pool contract holds native value) --------------
Whale Volume Concentration % (KPI-05) =
VAR _cutoff =
    PERCENTILEX.INC( ALL( dim_wallets ), dim_wallets[total_volume], 0.99 )
VAR _topVol =
    CALCULATE( SUM( dim_wallets[total_volume] ), dim_wallets[total_volume] >= _cutoff )
RETURN DIVIDE( _topVol, SUM( dim_wallets[total_volume] ) )

Whale Tx Concentration % =
VAR _cutoffT =
    PERCENTILEX.INC( ALL( dim_wallets ), dim_wallets[total_transactions], 0.99 )
VAR _topTx =
    CALCULATE( SUM( dim_wallets[total_transactions] ), dim_wallets[total_transactions] >= _cutoffT )
RETURN DIVIDE( _topTx, SUM( dim_wallets[total_transactions] ) )

// Month-1 retention (headline KPI-02) ---------------------------------------
Average Month-1 Retention = AVERAGE( cohort_retention_matrix[Month 1] )

// Time intelligence (month-over-month; no YOY patterns - < 1 year of data) ---
Active Wallets MoM % =
VAR _cur  = [Distinct Wallets Active in Period]
VAR _prev = CALCULATE( [Distinct Wallets Active in Period], DATEADD( DateTable[Date], -1, MONTH ) )
RETURN DIVIDE( _cur - _prev, _prev )

Total Volume MoM % =
VAR _cur  = [Total Volume (POL)]
VAR _prev = CALCULATE( [Total Volume (POL)], DATEADD( DateTable[Date], -1, MONTH ) )
RETURN DIVIDE( _cur - _prev, _prev )

Transactions MoM % =
VAR _cur  = [Total Transactions]
VAR _prev = CALCULATE( [Total Transactions], DATEADD( DateTable[Date], -1, MONTH ) )
RETURN DIVIDE( _cur - _prev, _prev )
```

**Note on MoM patterns:** `DATEADD` shifts the slicer window by one calendar
month. It behaves correctly when the page is filtered to a whole month (drill
down DateTable to month level, or use a month slicer). For day-level windows,
prefer the pre-aggregated `daily_kpi_summary` columns directly.

## Page 2 — Customer Intelligence

```dax
// Count and count % per segment (from the wallet dimension) -----------------
Segment Wallet Count = COUNTROWS( dim_wallets )

Segment Wallet Count Share % =
DIVIDE(
    [Segment Wallet Count],
    CALCULATE( [Segment Wallet Count], ALL( dim_wallets[wallet_segment] ) )
)

// Value share per segment (pre-computed in Part 5 extract) ------------------
Segment Volume Share % =
DIVIDE( SUM( rfm_segment_summary[pct_volume] ), 100 )

// Scatter: recency vs frequency uses raw dim_wallets columns, no DAX.
// Visual fields: X = dim_wallets[recency_days], Y = dim_wallets[total_transactions],
// Legend = dim_wallets[wallet_segment].
```

## Page 3 — Retention Analysis

```dax
Average Month-1 Retention = AVERAGE( cohort_retention_matrix[Month 1] )
```

Trend line (month-1 retention across cohorts): Visual values =
`cohort_retention_matrix[Month 1]`, axis = `cohort_retention_matrix[cohort_month]`
(direct columns, no measure required).

Heatmap/matrix: Matrix visual, rows = `cohort_month`, columns = `Month 0` …
`Month 6`, values = Sum of the `Month n` value (each becomes its own column
value) or switch rows/columns; use **Row subtotals off**, format values as
percent, conditional formatting on "Percent of row minimum/maximum" colormap.

## Page 4 — Operations & Cost

```dax
Gas Cost % of Transaction Value (KPI-04) =
DIVIDE( [Total Gas Cost (POL)], [Total Volume (POL)] )
// Native-unit ratio per KPI-04. In this dataset value_native ≈ 0 outside the
// Pool contract, so the % routinely exceeds 100% and DIVIDE returns blank
// where volume is 0 — read it as "gas dominates native value on this chain"
// (the Part 4 cost finding), not as an efficiency ratio.

Avg Gas Cost per Transaction (USD) =
DIVIDE( [Total Gas Cost (USD)], [Total Transactions] )

Gas Cost MoM % =
VAR _cur  = [Total Gas Cost (USD)]
VAR _prev = CALCULATE( [Total Gas Cost (USD)], DATEADD( DateTable[Date], -1, MONTH ) )
RETURN DIVIDE( _cur - _prev, _prev )
```

**Top 10 wallets by volume**: Table visual, values = `dim_wallets[total_volume]`
(DESC, Top 10 filter), `dim_wallets[wallet_segment]`,
`dim_wallets[total_transactions]`, `dim_wallets[recency_days]` — direct
dimension fields, no measure needed.

**Activity by hour / weekday**: Matrix visual over fact rows — rows =
`hour_utc`, columns = `weekday`, values = `Total Transactions` (count). Use
conditional formatting heatmap-style. (Day-of-week labels: 0 = Sunday.

## Measure reference checklist (spec coverage)

| Requirement | Measure / field |
|---|---|
| Total Active Wallets | `Total Active Wallets` |
| New Wallets (This Period) | `New Wallets This Period` |
| Returning Wallet Ratio | `Returning Wallet Ratio`, `New vs Returning Ratio (KPI-06)` |
| Total Transaction Volume | `Total Volume (POL)`, `Average Transaction Value` |
| Total Gas Cost | `Total Gas Cost (USD)` |
| Gas Cost % of Volume | `Gas Cost % of Transaction Value (KPI-04)` |
| Whale Concentration % | `Whale Volume Concentration % (KPI-05)`, `Whale Tx Concentration %` |
| Month-1 Retention Rate | `Average Month-1 Retention` |
| Segment volume % and count % | `Segment Wallet Count Share %`, `Segment Volume Share %` |
| MoM comparisons | `* MoM %` measures, `daily_kpi_summary` direct columns |