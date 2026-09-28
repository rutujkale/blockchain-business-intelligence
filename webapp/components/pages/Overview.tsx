"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dataset } from "@/lib/dataset";
import {
  CHART_COLORS,
  compact,
  dec2,
  dec4,
  int,
  monthTick,
  pct,
  shortMonthLabel,
} from "@/lib/format";
import { AXIS, ChartBox, ChartTooltip, GRID, Legend } from "../chart-kit";
import { Caveat, Card, CardFooter, CardHeader, Chip, KpiCard } from "../ui";

export default function OverviewPage({
  data,
  onGoToSystem,
  onOpenWallet,
}: {
  data: Dataset;
  onGoToSystem: () => void;
  onOpenWallet: () => void;
}) {
  const { kpi, monthly, findings } = data;

  const peakMonth = monthly.reduce((a, b) =>
    b.monthly_active_wallets > a.monthly_active_wallets ? b : a,
  );

  const topFindings = useMemo(
    () => [...findings.findings].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3),
    [findings.findings],
  );

  const txShare = monthly.map((m) => ({
    month: m.month,
    tick: monthTick(m.month),
    label: m.month_label,
    tx_count: m.tx_count,
  }));

  const mauChart = monthly.map((m) => ({
    tick: monthTick(m.month),
    label: m.month_label,
    mau: m.monthly_active_wallets,
  }));

  const topShare = monthly.reduce((a, b) => (b.tx_count > a.tx_count ? b : a));

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-lg">
        <KpiCard
          label="Total Wallets"
          value={int(kpi.total_wallets)}
          icon="wallet"
          hint="Unique analyzed"
          badge={{ text: "Includes Pool", tone: "neutral" }}
        />
        <KpiCard
          label="Transactions"
          value={int(kpi.total_transactions)}
          icon="receipt_long"
          hint="On-chain actions"
          badge={{ text: `${pct(kpi.failed_tx_pct)} failed`, tone: "bad" }}
        />
        <KpiCard
          label="Active Contracts"
          value={int(kpi.total_contracts)}
          icon="code_blocks"
          hint="Contracts observed"
          badge={{ text: "Pool / Oracle", tone: "neutral" }}
        />
        <KpiCard
          label="Month-1 Retention"
          value={pct(kpi.avg_month1_retention_pct)}
          icon="autorenew"
          hint="Cohort average"
          accent
          badge={{ text: "21% cliff", tone: "bad" }}
        />
        <KpiCard
          label="Top 1% Activity"
          value={pct(kpi.whale_concentration_pct)}
          icon="stacked_bar_chart"
          hint={`${int(kpi.whale_wallet_count)} wallets`}
          badge={{ text: "Concentrated", tone: "bad" }}
        />
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader
            title="Monthly Active Wallets"
            subtitle={`Distinct wallets per calendar month, including the Pool contract (${data.kpi.date_range.start} to ${data.kpi.date_range.end})`}
            right={
              <div className="flex flex-col items-end gap-1.5">
                <Chip tone="accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
                  Activity peaked in {peakMonth.month_label.split(" ")[0]} before declining
                </Chip>
                <span className="font-code-sm text-code-sm text-outline border-l border-outline-variant pl-2">
                  Peak: {int(peakMonth.monthly_active_wallets)}
                </span>
              </div>
            }
          />
          <ChartBox height={264}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mauChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="mauFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.28} />
                    <stop offset="90%" stopColor={CHART_COLORS[2]} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" tickFormatter={shortMonthLabel} {...AXIS} />
                <YAxis {...AXIS} tickFormatter={compact} width={44} />
                <Tooltip
                  cursor={{ stroke: "var(--color-outline-variant)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Area
                  type="monotone"
                  dataKey="mau"
                  name="Monthly Active Wallets"
                  stroke={CHART_COLORS[2]}
                  strokeWidth={2.5}
                  fill="url(#mauFill)"
                  dot={{ r: 3.5, strokeWidth: 1.5, stroke: "#fff", fill: CHART_COLORS[2] }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Caveat onNavigate={onGoToSystem}>
                Monthly Active Wallets include the Pool contract.
              </Caveat>
              <span className="font-code-sm text-code-sm">
                Polygon PoS Chain ID: {data.meta.chain_id}
              </span>
            </div>
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader
            title="Monthly Interactions"
            subtitle="Transaction volume by month"
            right={
              <span className="font-code-sm text-code-sm text-primary font-bold">
                {int(kpi.total_transactions)} Total
              </span>
            }
          />
          <ChartBox height={264}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={txShare} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="tick" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={compact} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Bar dataKey="tx_count" name="Transactions" radius={[4, 4, 0, 0]}>
                  {txShare.map((d) => (
                    <Cell
                      key={d.month}
                      fill={
                        d.month === topShare.month ? CHART_COLORS[2] : "var(--color-surface-container-high)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <div className="flex items-center justify-between gap-2">
              <span className="text-outline">Top month share:</span>
              <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                {topShare.month_label.split(" ")[0]} ={" "}
                {pct((topShare.tx_count / kpi.total_transactions) * 100)}
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader
            title="New vs Returning Wallets"
            subtitle="Where each month's active wallets came from"
          />
          <ChartBox height={228}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly.map((m) => ({
                  tick: monthTick(m.month),
                  new_wallets: m.new_wallets,
                  returning_wallets: m.returning_wallets,
                }))}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis dataKey="tick" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={compact} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  content={<ChartTooltip format={(v) => int(v)} />}
                />
                <Bar
                  dataKey="new_wallets"
                  name="New wallets"
                  stackId="a"
                  fill={CHART_COLORS[0]}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="returning_wallets"
                  name="Returning wallets"
                  stackId="a"
                  fill={CHART_COLORS[1]}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <CardFooter>
            <Legend
              items={[
                { label: "New wallets", color: CHART_COLORS[0] },
                { label: "Returning wallets", color: CHART_COLORS[1] },
              ]}
            />
          </CardFooter>
        </Card>

        <Card className="col-span-12 lg:col-span-5">
          <CardHeader title="Key Findings" subtitle="Highest-impact conclusions" />
          <div className="flex flex-col gap-2 p-space-lg">
            {topFindings.map((f) => (
              <div
                key={f.id}
                className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-code-sm text-code-sm font-semibold text-primary">
                    {f.id}
                  </span>
                  <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                    {f.title}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">
                  {f.business_impact}
                </p>
              </div>
            ))}
          </div>
          <CardFooter>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-outline">Concentration risk:</span>
              <span className="font-code-sm text-code-sm text-error font-semibold">
                {pct(kpi.whale_concentration_pct)} from top 1%
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 md:col-span-6 lg:col-span-4 p-space-lg gap-space-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Value &amp; Gas
            </h2>
            <span className="material-symbols-outlined text-outline" aria-hidden="true">
              payments
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-space-lg">
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Native volume</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {dec2(kpi.total_volume_pol)} POL
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Total gas</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                ${dec2(kpi.total_gas_cost_usd)}
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Avg gas / tx</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                ${dec4(kpi.avg_gas_cost_usd)}
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Failed</dt>
              <dd className="font-code-md text-code-md font-semibold text-error">
                {int(kpi.failed_tx_count)} ({pct(kpi.failed_tx_pct)})
              </dd>
            </div>
          </dl>
          <div className="border-t border-outline-variant/40 pt-3">
            <Caveat onNavigate={onGoToSystem}>{kpi.value_caveat}</Caveat>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-6 lg:col-span-4 p-space-lg gap-space-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Scope
            </h2>
            <span className="material-symbols-outlined text-outline" aria-hidden="true">
              dataset
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-space-lg">
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Window</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {kpi.date_range.days} days
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Contracts</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {int(kpi.total_contracts)}
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Token transfers</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {int(kpi.total_token_transfers)}
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Protocol</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface truncate">
                {data.meta.protocol}
              </dd>
            </div>
          </dl>
          <div className="border-t border-outline-variant/40 pt-3">
            <Caveat onNavigate={onGoToSystem}>
              September is partial through {data.kpi.date_range.end}.
            </Caveat>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4 p-space-lg gap-space-lg">
          <div className="flex items-center justify-between">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Target Contract
            </h2>
            <span className="material-symbols-outlined text-outline" aria-hidden="true">
              account_balance_wallet
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-code-sm text-code-sm text-on-surface break-all">
              {data.topWallets.protocol_contract.address}
            </span>
            <span className="font-label-sm text-label-sm text-outline">
              {data.topWallets.protocol_contract.label}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-space-lg">
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Transactions</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {int(data.topWallets.protocol_contract.total_transactions)}
              </dd>
            </div>
            <div>
              <dt className="font-label-sm text-label-sm text-outline">Volume</dt>
              <dd className="font-code-md text-code-md font-semibold text-on-surface">
                {dec2(data.topWallets.protocol_contract.total_volume_pol)} POL
              </dd>
            </div>
          </dl>
          <div className="border-t border-outline-variant/40 pt-3">
            <button
              type="button"
              onClick={onOpenWallet}
              className="inline-flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                arrow_forward
              </span>
              Open Wallet Explorer
            </button>
          </div>
        </Card>
      </div>

      <p className="font-body-sm text-body-sm text-outline">
        All figures computed from the clean transaction ledger. {kpi.whale_definition}
      </p>
    </div>
  );
}
