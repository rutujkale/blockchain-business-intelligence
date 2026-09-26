"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dataset } from "@/lib/dataset";
import { CHART_COLORS, compact, dec1, int, pct } from "@/lib/format";
import { AXIS, ChartBox, ChartTooltip, GRID, Legend } from "../chart-kit";
import { Card, CardFooter, CardHeader, Chip, KpiCard } from "../ui";

export default function CustomerIntelligencePage({ data }: { data: Dataset }) {
  const { segments, kpi, topWallets } = data;
  const rows = segments.segments;
  const maxCount = Math.max(...rows.map((r) => r.wallet_count));
  const activeSegments = rows.filter((r) => !["New", "Dormant"].includes(r.segment));
  const activeWallets = activeSegments.reduce((a, r) => a + r.wallet_count, 0);

  const sorted = [...rows].sort((a, b) => b.wallet_count - a.wallet_count);

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        <KpiCard
          label="Segmented Wallets"
          value={int(segments.total_wallets)}
          icon="group"
          hint="Every wallet classified"
        />
        <KpiCard
          label="Largest Segment"
          value={sorted[0].segment}
          icon="leaderboard"
          hint={`${int(sorted[0].wallet_count)} wallets`}
          badge={{ text: pct(sorted[0].pct_of_wallets), tone: "neutral" }}
        />
        <KpiCard
          label="Currently Active"
          value={int(activeWallets)}
          icon="bolt"
          hint="Excludes New and Dormant"
          accent
        />
        <KpiCard
          label="Top Wallet Share"
          value={pct(topWallets.wallets[0].share_pct)}
          icon="military_tech"
          hint={topWallets.wallets[0].address_short}
          badge={{ text: "Single address", tone: "bad" }}
        />
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader
            title="Segment Distribution"
            subtitle="Share of wallets by RFM segment"
          />
          <ChartBox height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip format={(v) => int(v)} />} />
                <Pie
                  data={rows}
                  dataKey="wallet_count"
                  nameKey="segment"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {rows.map((r, i) => (
                    <Cell key={r.segment} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <Legend
              items={rows.map((r, i) => ({
                label: r.segment,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
            />
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader
            title="Wallets and Frequency by Segment"
            subtitle="Bar length is wallet count; label is average transactions per wallet"
          />
          <ChartBox height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid {...GRID} horizontal={false} vertical />
                <XAxis type="number" {...AXIS} tickFormatter={compact} />
                <YAxis
                  type="category"
                  dataKey="segment"
                  {...AXIS}
                  width={132}
                  tick={{ fill: "var(--color-on-surface)", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Bar
                  dataKey="wallet_count"
                  name="Wallets"
                  radius={[0, 4, 4, 0]}
                  fill={CHART_COLORS[2]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-outline">Segmentation basis:</span>
              <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                Recency x Frequency
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Segment Detail"
          subtitle="Wallet counts, share of wallets, and average activity per wallet"
        />
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container-low text-outline">
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Segment
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Wallets
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  % of Wallets
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  % of Volume
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                  Avg Tx / Wallet
                </th>
                <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant w-1/4">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.segment} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="text-body-sm text-body-sm text-on-surface">
                        {r.segment}
                      </span>
                    </span>
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {int(r.wallet_count)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {pct(r.pct_of_wallets)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {pct(r.pct_of_volume)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                    {dec1(r.avg_transactions)}
                  </td>
                  <td className="px-space-lg py-2.5 border-b border-outline-variant/40">
                    <span className="flex items-center gap-2">
                      <span className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${(r.wallet_count / maxCount) * 100}%`,
                            background: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </span>
                      <span className="font-code-sm text-code-sm text-outline w-14 text-right">
                        {pct(r.pct_of_wallets)}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden p-space-lg flex flex-col gap-2">
          {rows.map((r, i) => (
            <div
              key={r.segment}
              className="rounded-lg border border-outline-variant/70 p-3 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-body-sm text-on-surface truncate">{r.segment}</span>
                </span>
                <span className="font-code-sm text-code-sm font-semibold text-on-surface">
                  {int(r.wallet_count)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Chip>{pct(r.pct_of_wallets)} of wallets</Chip>
                <span className="font-code-sm text-code-sm text-outline">
                  avg {dec1(r.avg_transactions)} tx
                </span>
              </div>
            </div>
          ))}
        </div>

        <CardFooter>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-outline">{segments.note}</span>
            <span className="font-code-sm text-code-sm text-outline">
              Total volume share is degenerate — see System.
            </span>
          </div>
        </CardFooter>
      </Card>

      <p className="font-body-sm text-body-sm text-outline">
        Whale definition used across the app: {kpi.whale_definition}
      </p>
    </div>
  );
}
