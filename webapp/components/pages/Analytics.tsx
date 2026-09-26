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
import { CHART_COLORS, int, pct } from "@/lib/format";
import { AXIS, ChartBox, ChartTooltip, GRID, Legend } from "../chart-kit";
import { Card, CardFooter, CardHeader, Chip, KpiCard } from "../ui";

export default function AnalyticsPage({
  data,
  onGoToSystem,
}: {
  data: Dataset;
  onGoToSystem: () => void;
}) {
  const { functions, kpi } = data;
  const h = functions.headline_metrics;
  const mix = functions.mix;
  const maxTx = Math.max(...mix.map((m) => m.tx_count));

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        <KpiCard
          label="Largest Function"
          value={mix[0].function}
          icon="functions"
          hint={`${int(mix[0].tx_count)} txs`}
          badge={{ text: pct(mix[0].pct_of_total), tone: "accent" }}
        />
        <KpiCard
          label="Flash Loan Rate"
          value={pct(h.flash_loan_rate_pct, 2)}
          icon="flash_on"
          hint={`${int(h.flash_loan_tx_count)} txs`}
          badge={{ text: "Composable use", tone: "good" }}
        />
        <KpiCard
          label="Liquidation Rate"
          value={pct(h.liquidation_call_rate_pct, 2)}
          icon="gavel"
          hint={`${int(h.liquidation_call_count)} calls`}
          badge={{ text: "Low stress", tone: "good" }}
        />
        <KpiCard
          label="Undecoded Calls"
          value={int(h.undecoded_tx_count)}
          icon="question_mark"
          hint="Unknown selectors"
          badge={{ text: pct((h.undecoded_tx_count / kpi.total_transactions) * 100, 2), tone: "neutral" }}
        />
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader title="Function Mix" subtitle="Share of transactions by protocol function" />
          <ChartBox height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={
                    <ChartTooltip
                      format={(v, name) => {
                        const row = mix.find((m) => m.function === name);
                        return `${int(v)} (${pct(row?.pct_of_total ?? 0, 2)})`;
                      }}
                    />
                  }
                />
                <Pie
                  data={mix}
                  dataKey="tx_count"
                  nameKey="function"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {mix.map((m, i) => (
                    <Cell key={m.function} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <Legend
              items={mix.map((m, i) => ({
                label: `${m.function} ${pct(m.pct_of_total)}`,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
            />
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader
            title="Transactions by Function"
            subtitle={`Count of ${int(functions.total_transactions)} decoded + undecoded calls`}
          />
          <ChartBox height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={mix}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid {...GRID} horizontal={false} vertical />
                <XAxis type="number" {...AXIS} />
                <YAxis
                  type="category"
                  dataKey="function"
                  {...AXIS}
                  width={82}
                  tick={{ fill: "var(--color-on-surface)", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Bar dataKey="tx_count" name="Transactions" radius={[0, 4, 4, 0]}>
                  {mix.map((m, i) => (
                    <Cell key={m.function} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex items-center justify-between gap-2">
              <span className="text-outline">Supply + withdraw share:</span>
              <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                {pct(mix[0].pct_of_total + mix[1].pct_of_total)}
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="How these counts are grouped"
          subtitle="Read this before comparing the numbers to any other source"
          right={<Chip tone="accent">Grouping rule</Chip>}
        />
        <div className="p-space-lg flex flex-col gap-3">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {functions.grouping_rule}
          </p>
          <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Any table that splits by exact function signature instead of by name prefix
              will report smaller counts — for example supply would read 53,181 rather than{" "}
              {int(mix[0].tx_count)} — because proxy/delegation wrappers and multi-hop
              variants add extra signatures that still carry the same function name. Both
              numbers are correct for their own question; this app uses the prefix rule.
            </p>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-low text-outline">
                  <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                    Function
                  </th>
                  <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                    Transactions
                  </th>
                  <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                    % of Total
                  </th>
                  <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                    Relative
                  </th>
                </tr>
              </thead>
              <tbody>
                {functions.detail.map((m, i) => (
                  <tr key={m.function} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-space-lg py-2.5 border-b border-outline-variant/40">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-body-sm text-on-surface">{m.function}</span>
                      </span>
                    </td>
                    <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                      {int(m.tx_count)}
                    </td>
                    <td className="px-space-lg py-2.5 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                      {pct(m.pct_of_total, 2)}
                    </td>
                    <td className="px-space-lg py-2.5 border-b border-outline-variant/40">
                      <span
                        className="block h-1.5 rounded-full"
                        style={{
                          width: `${(m.tx_count / maxTx) * 100}%`,
                          minWidth: "4px",
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden flex flex-col gap-2">
            {functions.detail.map((m, i) => (
              <div
                key={m.function}
                className="rounded-lg border border-outline-variant/70 p-3 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 min-w-0" title={m.function}>
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-body-sm text-on-surface truncate">{m.function}</span>
                </span>
                <span className="font-code-sm text-code-sm text-on-surface shrink-0">
                  {int(m.tx_count)} · {pct(m.pct_of_total)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <CardFooter>
          <button
            type="button"
            onClick={onGoToSystem}
            className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              info
            </span>
            See the full limitations list on the System page
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
