"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dataset } from "@/lib/dataset";
import { CHART_COLORS, dec1, int, pct, shortMonthLabel } from "@/lib/format";
import { AXIS, ChartBox, ChartTooltip, GRID, heatScale } from "../chart-kit";
import { Card, CardFooter, CardHeader, Chip, KpiCard } from "../ui";

export default function RetentionPage({ data }: { data: Dataset }) {
  const { cohorts, kpi, segments } = data;
  const maxMonths = Math.max(...cohorts.cohorts.map((c) => c.retention.length));
  const monthCols = Array.from({ length: maxMonths }, (_, i) => (i === 0 ? "M0" : `M${i}`));

  const m1 = cohorts.cohorts.map((c) => ({
    label: c.cohort_month_label,
    tick: shortMonthLabel(c.cohort_month_label),
    size: c.cohort_size,
    m1: c.retention[1] ?? null,
  }));

  const best = cohorts.cohorts.reduce((a, b) =>
    (a.retention[1] ?? 0) >= (b.retention[1] ?? 0) ? a : b,
  );
  const worst = cohorts.cohorts.reduce((a, b) =>
    (a.retention[1] ?? 0) <= (b.retention[1] ?? 0) ? a : b,
  );

  const decay = monthCols.map((label, i) => {
    const vals = cohorts.cohorts
      .map((c) => c.retention[i])
      .filter((v): v is number => typeof v === "number");
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { label, avg: Number(avg.toFixed(1)) };
  });

  const reactivationPool = segments.segments
    .filter((s) => ["High-Value Dormant", "Dormant", "Frequent Users"].includes(s.segment))
    .reduce((a, s) => a + s.wallet_count, 0);

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        <KpiCard
          label="Avg Month-1 Retention"
          value={pct(cohorts.avg_month1_retention_pct)}
          icon="autorenew"
          hint="Cohort average"
          accent
          badge={{ text: "Sharpest drop", tone: "bad" }}
        />
        <KpiCard
          label="Best Cohort"
          value={pct(best.retention[1] ?? 0)}
          icon="trending_up"
          hint={best.cohort_month_label}
          badge={{ text: `${int(best.cohort_size)} wallets`, tone: "neutral" }}
        />
        <KpiCard
          label="Worst Cohort"
          value={pct(worst.retention[1] ?? 0)}
          icon="trending_down"
          hint={worst.cohort_month_label}
          badge={{ text: `${int(worst.cohort_size)} wallets`, tone: "bad" }}
        />
        <KpiCard
          label="Reactivation Pool"
          value={int(reactivationPool)}
          icon="restart_alt"
          hint="Dormant + frequent"
          badge={{ text: "Cheapest win", tone: "good" }}
        />
      </div>

      <Card>
        <CardHeader
          title="Cohort Retention Matrix"
          subtitle={cohorts.definition}
          right={<Chip tone="accent">Average M1 = {pct(cohorts.avg_month1_retention_pct)}</Chip>}
        />
        <div className="p-space-lg overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="text-left font-label-sm text-label-sm font-medium text-outline px-2 py-1.5">
                  Cohort
                </th>
                <th className="text-right font-label-sm text-label-sm font-medium text-outline px-2 py-1.5">
                  Size
                </th>
                {monthCols.map((m) => (
                  <th
                    key={m}
                    className="text-right font-label-sm text-label-sm font-medium text-outline px-2 py-1.5"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.cohorts.map((c) => (
                <tr key={c.cohort_month}>
                  <td className="px-2 py-1 text-body-sm text-on-surface whitespace-nowrap">
                    {c.cohort_month_label}
                  </td>
                  <td className="px-2 py-1 text-right font-code-sm text-code-sm text-outline">
                    {int(c.cohort_size)}
                  </td>
                  {monthCols.map((m, i) => {
                    const v = c.retention[i];
                    if (typeof v !== "number") {
                      return (
                        <td key={m} className="px-2 py-1 text-right font-code-sm text-code-sm text-outline/40">
                          —
                        </td>
                      );
                    }
                    const t = v / 100;
                    const strong = t > 0.5;
                    return (
                      <td key={m} className="p-0.5">
                        <span
                          className="block rounded font-code-sm text-code-sm text-center py-1.5 min-w-[58px]"
                          style={{
                            background: heatScale(t),
                            color: strong ? "#fff" : "var(--color-on-surface)",
                          }}
                        >
                          {dec1(v)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardFooter>
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm text-outline">0%</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{
                background: `linear-gradient(to right, ${heatScale(0)}, ${heatScale(0.25)}, ${heatScale(0.5)}, ${heatScale(0.75)}, ${heatScale(1)})`,
              }}
            />
            <span className="font-label-sm text-label-sm text-outline">100%</span>
          </div>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader
            title="Retention Decay"
            subtitle="Average retained share across all cohorts, by month offset"
          />
          <ChartBox height={252}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={decay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} width={40} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip format={(v) => pct(v)} />} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="Avg retention"
                  stroke={CHART_COLORS[2]}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, strokeWidth: 1.5, stroke: "#fff", fill: CHART_COLORS[2] }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex items-center justify-between gap-2">
              <span className="text-outline">Month-0 to month-1 drop:</span>
              <span className="font-code-sm text-code-sm text-error font-semibold">
                {pct(100 - (decay[1]?.avg ?? 0))} lost
              </span>
            </div>
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader
            title="Month-1 Retention by Cohort"
            subtitle="The month-1 cliff, cohort by cohort"
          />
          <ChartBox height={252}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m1} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="tick" {...AXIS} />
                <YAxis {...AXIS} width={40} domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => pct(v)} />}
                />
                <Bar dataKey="m1" name="Month-1 retention" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-outline">Pool contract is counted as a wallet in these cohorts.</span>
              <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                avg {pct(kpi.avg_month1_retention_pct)}
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
