# ChainBI web app

The primary deliverable of [Blockchain Business Intelligence](../README.md) — a
seven-page Next.js dashboard over Aave V3 Pool activity on Polygon, reading
pre-exported analysis payloads.

**Live:** <https://chainbi-analytics.vercel.app>

## Requirements

- **Node 24.** This matches Vercel's default for new projects, so there is
  deliberately no `engines` field in `package.json`.
- No database, no API keys, no Python. Everything the UI needs is already
  exported to JSON.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # static prerender of /
npm run start      # serve the production build
npx tsc --noEmit   # typecheck (there is no `lint` script defined)
```

On Windows PowerShell, use `npm.cmd` / `npx.cmd` if script execution is blocked
by policy.

## Data

The app reads **13 JSON payloads** (~250 KB) from `public/data/`, imported at
build time by `app/page.tsx`. Because they are read during `next build` and
there is no runtime fetching, `/` prerenders as fully static content — which is
why the deploy is a 40-second build with no server runtime.

Regenerate them from the repo root after changing anything in the pipeline:

```powershell
.\venv\Scripts\python.exe src\analysis\export_for_webapp.py
```

The payloads are the only coupling between this app and the Python side. Nothing
here queries PostgreSQL, so the app runs correctly on a machine that has never
run the extraction.

## Layout

| Path | Role |
|---|---|
| `app/layout.tsx` | Fonts (Geist + JetBrains Mono via `next/font`, Material Symbols via CDN link), metadata |
| `app/page.tsx` | Server component; loads the 13 payloads and hands them to the client shell |
| `components/Dashboard.tsx` | Client shell — routing, filter state (`DEFAULT_FILTERS` from `WalletDrawer`), and the filtered wallet list |
| `components/pages/*.tsx` | The seven pages |
| `components/FilterModal.tsx` | The controlled filter sheet (segment + function) |
| `components/WalletDrawer.tsx` | Wallet Explorer detail drawer; owns the `Filters` type and its defaults |
| `components/chart-kit.tsx` | Shared chart chrome — `AXIS`/`GRID` tokens, `ChartTooltip`, `Legend`, `ChartBox`, and `heatScale` for the heatmap |
| `lib/dataset.ts` | `server-only`; reads the 13 payloads off disk and returns the typed `Dataset` |
| `lib/format.ts` | Number/date/token formatters and `CHART_COLORS` |
| `lib/csv.ts` | CSV export |

Design tokens (type scale, spacing, elevation) are ported from a
Stitch-generated "Precision Analytical System" spec into the Tailwind v4
`@theme` block in `app/globals.css`, which is also where the categorical series
colours are defined as `--color-chart-1…8`. `CHART_COLORS` in `lib/format.ts`
mirrors that sequence for Recharts, so the same series keeps the same colour
across every page.

## Deployment

**Pushes to `main` auto-deploy to Vercel.** That is the only working deployment
path from this repository, and it is intentional.

There is no working manual CLI deploy here, and the reason is worth recording so
nobody loses an hour to it. The Vercel project's Root Directory is `webapp`,
which is *required* for Git-triggered builds — the repo root is a Python project
with no `package.json`, so a build rooted there finds no Next.js app. But the
Vercel CLI also applies that Root Directory to its own upload root, so:

| Invocation | Result |
|---|---|
| `cd webapp` then `npx vercel --prod` | `Error: The specified Root Directory "webapp" does not exist` |
| `npx vercel --prod --cwd webapp` from the repo root | `Error: ...\webapp\webapp does not exist` |

These are configuration errors, not transient failures; retrying does not help.
To ship a change, edit here and push.

Note also that the stock `create-next-app` "Deploy on Vercel" link
(`vercel.com/new`) is not a valid way to deploy this project — it would create a
*second, disconnected* Vercel project that never receives data updates, and
would fail silently rather than erroring.
