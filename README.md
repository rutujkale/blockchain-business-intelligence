# Blockchain Business Intelligence

**End-to-end DeFi analytics project:** transaction-level business intelligence for the **Aave V3 Pool** on **Polygon PoS**, from raw on-chain data acquisition to an interactive Power BI dashboard.

## What this is

A portfolio project that treats a DeFi protocol like a business. It defines stakeholders and key performance indicators, extracts 6 months of real on-chain activity, builds a relational data warehouse, performs exploratory and customer-level analysis, and delivers business recommendations — not just charts.

- **Contract:** Aave V3 Pool `0x794a...4aD` (Polygon, chainid 137)
- **Data:** 158,916 transactions · 2026-03-09 → 2026-09-05 · live Etherscan V2 API
- **Stack:** Python, PostgreSQL, pandas, GitHub Actions (CI), Power BI
- **Status:** Progression through a 9-part build plan (see `docs/`)

## Project structure

```
├── data/                  # raw extracts + processed warehouse data
├── src/                   # pipeline code
│   ├── extraction/        #   Etherscan V2 API extraction scripts
│   ├── transformation/    #   cleaning + load to PostgreSQL (in progress)
│   └── analysis/          #   exploratory & customer intelligence (in progress)
├── notebooks/             # analysis notebooks (in progress)
├── dashboard/             # Power BI artifacts
├── outputs/               # exported charts / insight summaries
└── docs/                  # business definition & project docs
```

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/stakeholder_map.md`](docs/stakeholder_map.md) | Stakeholders and their analytics needs |
| [`docs/business_requirements.md`](docs/business_requirements.md) | BR-01..BR-07: business requirements with acceptance criteria |
| [`docs/kpi_framework.md`](docs/kpi_framework.md) | KPI-01..KPI-07: definitions, formulas, data sources |
| [`docs/methodology.md`](docs/methodology.md) | Pipeline & analysis methodology |
| [`docs/data_dictionary.md`](docs/data_dictionary.md) | Data model reference |
| [`docs/limitations.md`](docs/limitations.md) | Known limitations & assumptions |

## Data pipeline (current state)

1. **Extraction** — `src/extraction/fetch_transactions.py` pulls `txlist` + `tokentx` from the Etherscan V2 unified API in block-chunked, resumable batches (rate-limit/retry safe). `fetch_contract_metadata.py` resolves contract names / verification status. → `data/raw/`
2. **Cleaning + Load** *(in progress)* — normalize schemas, filter unverified spam tokens, load into a PostgreSQL warehouse. → `data/sql/schema.sql`
3. **Analysis** *(planned)* — KPI dashboards, exploratory analysis, cohort/retention, whale & liquidation insights. → `notebooks/`
4. **Dashboard** *(planned)* — interactive Power BI reporting. → `dashboard/`

> Raw extracts are gitignored due to size; pipeline scripts reproduce them (run from repo root with `.env` containing an `EXPLORER_API_KEY`). Full README and release write-up land in the final build part.

## Getting started

```powershell
pip install -r requirements.txt
cp .env.example .env          # add your Etherscan V2 API key
python src/extraction/fetch_transactions.py
```

## Roadmap

- [x] Part 0 — Project setup
- [x] Part 1 — Business definition (stakeholders, BRD, KPI framework)
- [x] Part 2 — Data acquisition (Etherscan V2 extraction)
- [ ] Part 3 — Data engineering (PostgreSQL warehouse)
- [ ] Part 4 — Exploratory analysis
- [ ] Part 5 — Customer intelligence
- [ ] Part 6 — Power BI dashboard
- [ ] Part 7 — Business recommendations
- [ ] Part 8 — Documentation & final README