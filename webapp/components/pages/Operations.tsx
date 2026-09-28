"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dataset } from "@/lib/dataset";
import {
  CHART_COLORS,
  dec2,
  dec4,
  int,
  longDate,
  pct,
  shortDate,
} from "@/lib/format";
import { AXIS, ChartBox, ChartTooltip, GRID, heatScale } from "../chart-kit";
import { DEFAULT_FILTERS, type Filters } from "../WalletDrawer";
import {
  Address,
  Caveat,
  Card,
  CardFooter,
  CardHeader,
  Chip,
  KpiCard,
  SEGMENT_CAVEAT,
} from "../ui";

const PAGE_SIZE = 10;

export default function OperationsPage({
  data,
  filters,
  onGoToSystem,
  onSelectWallet,
  onClearFilters,
}: {
  data: Dataset;
  filters: Filters;
  onGoToSystem: () => void;
  onSelectWallet: (address: string) => void;
  onClearFilters: () => void;
}) {
  const { daily, hourly, topWallets, kpi, functions } = data;
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<"tx" | "share">("tx");

  const days = daily.days;
  const peakDay = days.reduce((a, b) => (b.dau > a.dau ? b : a));

  const maxCell = Math.max(...hourly.grid.flat());

  const wallets = useMemo(
    () =>
      [...topWallets.wallets]
        .filter((w) => filters.segment === DEFAULT_FILTERS.segment || w.segment === filters.segment)
        .sort((a, b) =>
          sortKey === "tx"
            ? b.total_transactions - a.total_transactions
            : b.share_pct - a.share_pct,
        ),
    [topWallets.wallets, filters.segment, sortKey],
  );

  const pageCount = Math.max(1, Math.ceil(wallets.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [filters.segment, sortKey]);

  const visible = wallets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const throughput = days.map((d) => ({
    tick: shortDate(d.event_date),
    tx_count: d.tx_count,
    failed: d.failed_tx_count,
    successful: Math.max(0, d.tx_count - d.failed_tx_count),
  }));

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        <KpiCard
          label="Total Gas Cost"
          value={`$${dec2(kpi.total_gas_cost_usd)}`}
          icon="local_gas_station"
          hint="USD, whole period"
          badge={{ text: `$${dec4(kpi.avg_gas_cost_usd)}/tx`, tone: "neutral" }}
        />
        <KpiCard
          label="Peak Single Day"
          value={int(peakDay.tx_count)}
          icon="bolt"
          hint={`${longDate(peakDay.event_date)} txs`}
          badge={{ text: `${int(peakDay.dau)} DAU`, tone: "bad" }}
        />
        <KpiCard
          label="Peak Time Slot"
          value={hourly.peak.hour_label}
          icon="schedule"
          hint={hourly.peak.weekday_label}
          badge={{ text: `${int(hourly.peak.tx_count)} txs`, tone: "accent" }}
        />
        <KpiCard
          label="Median Gas Used"
          value={int(functions.headline_metrics.median_gas_used)}
          icon="speed"
          hint="Gas units per tx"
          badge={{ text: `${int(functions.headline_metrics.undecoded_tx_count)} undecoded`, tone: "neutral" }}
        />
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader
            title="Daily Throughput"
            subtitle="Transactions per day across the full window (March 09 — September 05, 2026)"
            right={
              <Chip tone="bad">
                <span className="h-1.5 w-1.5 rounded-full bg-error" />
                One-day spike then collapse
              </Chip>
            }
          />
          <ChartBox height={252}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughput} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="opsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.26} />
                    <stop offset="90%" stopColor={CHART_COLORS[2]} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="tick" {...AXIS} interval={29} />
                <YAxis {...AXIS} width={44} />
                <Tooltip
                  cursor={{ stroke: "var(--color-outline-variant)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Area
                  type="monotone"
                  dataKey="tx_count"
                  name="Transactions"
                  stroke={CHART_COLORS[2]}
                  strokeWidth={2}
                  fill="url(#opsFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-outline">Failed transactions over the window:</span>
              <span className="font-code-sm text-code-sm text-error font-semibold">
                {int(kpi.failed_tx_count)} ({pct(kpi.failed_tx_pct)})
              </span>
            </div>
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader title="Failed vs Successful" subtitle="Daily, stacked" />
          <ChartBox height={252}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughput} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="tick" {...AXIS} interval={29} />
                <YAxis {...AXIS} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Bar
                  dataKey="successful"
                  name="Successful"
                  stackId="t"
                  fill={CHART_COLORS[2]}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  stackId="t"
                  fill={CHART_COLORS[4]}
                  radius={[0, 0, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <Caveat onNavigate={onGoToSystem}>
              {kpi.failed_tx_count.toLocaleString("en-US")} failed of{" "}
              {int(kpi.total_transactions)}.
            </Caveat>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Hour-of-Day / Day-of-Week Heatmap"
          subtitle={hourly.definition}
          right={
            <Chip tone="accent">
              Peak {hourly.peak.weekday_label} {hourly.peak.hour_label}
            </Chip>
          }
        />
        <div className="p-space-lg overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="flex gap-1 mb-1 pl-16">
              {hourly.hours.map((h) => (
                <span
                  key={h}
                  className="flex-1 text-center font-code-sm text-code-sm text-outline"
                >
                  {h % 3 === 0 ? h : ""}
                </span>
              ))}
            </div>
            {hourly.grid.map((row, wi) => (
              <div key={hourly.weekdays_long[wi]} className="flex items-center gap-1 mb-1">
                <span className="w-16 shrink-0 font-label-sm text-label-sm text-outline pr-2 text-right">
                  {hourly.weekdays_long[wi]}
                </span>
                {row.map((v, hi) => (
                  <span
                    key={hourly.hours[hi]}
                    title={`${hourly.weekdays_long[wi]} ${String(hourly.hours[hi]).padStart(2, "0")}:00 UTC — ${int(v)} txs`}
                    className="flex-1 h-6 rounded-sm"
                    style={{
                      background: heatScale(v / maxCell),
                    }}
                  />
                ))}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3 pl-16">
              <span className="font-label-sm text-label-sm text-outline">0</span>
              <span
                className="h-2 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${heatScale(0)}, ${heatScale(0.5)}, ${heatScale(1)})`,
                }}
              />
              <span className="font-label-sm text-label-sm text-outline">
                {int(maxCell)} txs
              </span>
            </div>
          </div>
        </div>
        <CardFooter>
          <span>{hourly.finding}</span>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader
          title="Top Wallets by Activity"
          subtitle={topWallets.note}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {filters.segment !== DEFAULT_FILTERS.segment && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary-fixed/60 text-primary border border-primary/20 font-label-sm text-label-sm font-semibold"
                >
                  {filters.segment}
                  <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                    close
                  </span>
                </button>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-outline-variant p-0.5">
                {(["tx", "share"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSortKey(s)}
                    className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold transition-colors ${
                      sortKey === "tx"
                        ? "bg-surface-container-low text-primary"
                        : "text-outline hover:text-on-surface"
                    }`}
                  >
                    {s === "tx" ? "By tx" : "By share"}
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {wallets.length === 0 ? (
          <p className="m-space-lg rounded-lg bg-surface-container-low border border-outline-variant/60 p-4 font-body-sm text-body-sm text-on-surface-variant">
            No wallets in the <strong>{filters.segment}</strong> segment appear in the top-20
            activity table.{" "}
            <button type="button" onClick={onClearFilters} className="text-primary hover:underline">
              Clear filter
            </button>
          </p>
        ) : (
          <>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container-low text-outline">
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant w-12">
                  #
                </th>
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Address
                </th>
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Segment
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Tx
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Share
                </th>
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((w, i) => (
                <tr
                  key={w.address}
                  onClick={() => onSelectWallet(w.address)}
                  className="hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 font-code-sm text-code-sm text-outline">
                    {String(page * PAGE_SIZE + i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40">
                    <Address href={w.explorer_url} className="text-on-surface">
                      {w.address_short}
                    </Address>
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-body-sm text-on-surface-variant">
                    {w.segment}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {int(w.total_transactions)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {pct(w.share_pct, 2)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 font-code-sm text-code-sm text-outline">
                    {longDate(w.last_seen_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-space-lg flex flex-col gap-2">
          {visible.map((w, i) => (
            <button
              key={w.address}
              type="button"
              onClick={() => onSelectWallet(w.address)}
              className="rounded-lg border border-outline-variant/70 p-3 flex flex-col gap-1.5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-code-sm text-code-sm text-on-surface">
                  {String(page * PAGE_SIZE + i + 1).padStart(2, "0")} {w.address_short}
                </span>
                <span className="font-code-sm text-code-sm font-semibold text-on-surface">
                  {int(w.total_transactions)} tx
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm text-on-surface-variant truncate">{w.segment}</span>
                <span className="font-code-sm text-code-sm text-outline">
                  {pct(w.share_pct, 2)} · {longDate(w.last_seen_date)}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 p-space-lg pt-0">
          <span className="font-label-sm text-label-sm text-outline">
            Showing {wallets.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, wallets.length)} of {wallets.length} wallets
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="p-1.5 rounded-lg border border-outline-variant text-outline hover:text-on-surface disabled:opacity-40 disabled:hover:text-outline"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                chevron_left
              </span>
            </button>
            <span className="font-code-sm text-code-sm text-on-surface px-1">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              aria-label="Next page"
              className="p-1.5 rounded-lg border border-outline-variant text-outline hover:text-on-surface disabled:opacity-40 disabled:hover:text-outline"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                chevron_right
              </span>
            </button>
          </div>
        </div>
          </>
        )}

        <CardFooter>
          <div className="flex flex-col gap-2">
            <Caveat onNavigate={onGoToSystem}>{SEGMENT_CAVEAT}</Caveat>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Caveat onNavigate={onGoToSystem}>
                The Pool contract is excluded here and shown separately.
              </Caveat>
              <span className="font-code-sm text-code-sm text-outline">
                Total volume {dec2(topWallets.protocol_contract.total_volume_pol)} POL concentrated
                in Pool
              </span>
            </div>
          </div>
        </CardFooter>
      </Card>

      <Card className="p-space-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-lg">
          <div>
            <div className="font-label-sm text-label-sm text-outline">Flash loans</div>
            <div className="font-code-md text-code-md font-semibold text-on-surface">
              {int(functions.headline_metrics.flash_loan_tx_count)}
            </div>
            <div className="font-code-sm text-code-sm text-outline">
              {pct(functions.headline_metrics.flash_loan_rate_pct, 2)} of txs
            </div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline">Liquidations</div>
            <div className="font-code-md text-code-md font-semibold text-on-surface">
              {int(functions.headline_metrics.liquidation_call_count)}
            </div>
            <div className="font-code-sm text-code-sm text-outline">
              {pct(functions.headline_metrics.liquidation_call_rate_pct, 2)} of txs
            </div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline">Avg gas cost</div>
            <div className="font-code-md text-code-md font-semibold text-on-surface">
              ${dec4(kpi.avg_gas_cost_usd)}
            </div>
            <div className="font-code-sm text-code-sm text-outline">per transaction</div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline">Token transfers</div>
            <div className="font-code-md text-code-md font-semibold text-on-surface">
              {int(kpi.total_token_transfers)}
            </div>
            <div className="font-code-sm text-code-sm text-outline">ERC-20 transfer events</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
