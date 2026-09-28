"use client";

import type { Dataset } from "@/lib/dataset";
import { int, longDate } from "@/lib/format";
import { Address, Card, CardHeader, Chip, KpiCard } from "../ui";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-outline-variant/40 last:border-0">
      <span className="font-label-sm text-label-sm text-outline shrink-0">{label}</span>
      <span className="font-code-sm text-code-sm text-on-surface text-right min-w-0 break-all">
        {value}
      </span>
    </div>
  );
}

export default function SystemPage({ data }: { data: Dataset }) {
  const { meta, limitations, kpi } = data;
  const e = meta.extraction as Record<string, string | number | boolean>;
  const c = meta.cleaning as Record<string, string | number | boolean>;
  const w = meta.warehouse as Record<string, string | number | boolean>;

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        {/*
          Same false liveness as the sidebar badge, and this is the page a
          reader checks to decide how much to trust the numbers. "Healthy"
          with a green "Verified" chip described a running pipeline; the
          data is a static JSON snapshot that cannot change until a rebuild.
          Now states the snapshot date, read from the payload so it cannot
          drift from the data it describes.
        */}
        <KpiCard
          label="Data Pipeline"
          value="Snapshot"
          icon="inventory_2"
          hint={`Static JSON, as of ${longDate(String(meta.date_range.end))}`}
        />
        {/*
          `rows_extracted` and `rows_cleaned` are not keys in
          pipeline_meta.json. `?? 0` swallowed the miss, so both cards read
          "0" on the page whose entire job is to show where the data came
          from. These are the real keys: extraction.transactions_raw and
          cleaning.transactions_clean_rows.
        */}
        <KpiCard
          label="Rows In"
          value={int(Number(e.transactions_raw ?? 0))}
          icon="download"
          hint="Raw extraction"
        />
        <KpiCard
          label="Rows Cleaned"
          value={int(Number(c.transactions_clean_rows ?? 0))}
          icon="cleaning_services"
          hint="After validation"
        />
        <KpiCard
          label="Limitations"
          value={String(limitations.limitations.length)}
          icon="warning"
          hint="Documented and disclosed"
          accent
        />
      </div>

      <div className="grid grid-cols-12 gap-gutter-lg">
        <Card className="col-span-12 lg:col-span-5 p-space-lg">
          <CardHeader title="Pipeline Provenance" subtitle="Where every number comes from" />
          <div className="p-space-lg pt-0 flex flex-col">
            <Row label="Chain" value={`${meta.chain} (ID ${meta.chain_id})`} />
            <Row label="Protocol" value={meta.protocol} />
            <Row label="Contract" value={meta.contract_label} />
            <Row label="Contract address" value={meta.contract_address} />
            <Row label="API" value={meta.api} />
            <Row label="Price feed" value={meta.price_feed} />
            <Row label="Date range" value={`${longDate(String(meta.date_range.start))} — ${longDate(String(meta.date_range.end))}`} />
            {/*
              block_range.start/end are both null in the payload, and
              Number(null) is 0, so this row rendered "0 — 0". The extracted
              range is recorded once, as a string, under extraction.
            */}
            <Row label="Block range" value={String(e.block_range ?? "—")} />
          </div>
          <div className="px-space-lg pb-space-lg">
            <Address href={`https://polygonscan.com/address/${meta.contract_address}`} className="text-primary hover:underline">
              View contract on Polygonscan
            </Address>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-7 p-space-lg">
          <CardHeader title="Processing" subtitle="Extraction, cleaning and warehouse steps" />
          <div className="p-space-lg pt-0 grid grid-cols-1 md:grid-cols-3 gap-space-lg">
            <div>
              <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
                Extraction
              </div>
              {Object.entries(e).map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
              ))}
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
                Cleaning
              </div>
              {Object.entries(c).map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
              ))}
            </div>
            <div>
              <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
                Warehouse
              </div>
              {Object.entries(w).map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
              ))}
            </div>
          </div>
          <div className="px-space-lg pb-space-lg">
            <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                This site reads static JSON at build time. No database, no runtime
                data fetching. Regenerate with{" "}
                <span className="font-code-sm text-code-sm text-on-surface">
                  {String(meta.webapp.source_script)}
                </span>
                .
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-space-lg">
        <CardHeader
          title="Labeling Rules"
          subtitle="This dataset has two different definitions of an active wallet"
        />
        <div className="p-space-lg pt-0 grid grid-cols-1 md:grid-cols-3 gap-space-lg">
          <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Chip tone="accent">Monthly</Chip>
              <span className="font-code-sm text-code-sm text-outline">kpi_summary.json</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Monthly Active Wallets = distinct wallets per calendar month,{" "}
              <strong>including</strong> the Pool contract. Peak{" "}
              {int(kpi.monthly_active_wallets_peak)} in{" "}
              {kpi.monthly_active_wallets_peak_month_label}.
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Chip tone="accent">Daily</Chip>
              <span className="font-code-sm text-code-sm text-outline">daily_activity.json</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {data.daily.definitions.dau} Not comparable to the monthly MAU.
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Chip tone="bad">Value</Chip>
              <span className="font-code-sm text-code-sm text-outline">kpi_summary.json</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{kpi.value_caveat}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Known Limitations"
          subtitle={limitations.source}
          right={<Chip tone="bad">{limitations.limitations.length} disclosed</Chip>}
        />
        <div className="p-space-lg pt-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {limitations.limitations.map((l) => (
            <div
              key={l.id}
              className="rounded-lg border border-outline-variant/70 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-code-sm text-code-sm font-semibold text-error">{l.id}</span>
                <h3 className="font-label-md text-label-md font-semibold text-on-surface">
                  {l.title}
                </h3>
              </div>
              <div>
                <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  What
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{l.what}</p>
              </div>
              <div>
                <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Why it matters
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {l.why_it_matters}
                </p>
              </div>
              <div>
                <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                  Mitigation
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{l.mitigation}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-space-lg pt-0">
          <div className="rounded-lg bg-error-container/40 border border-error/20 p-3">
            <div className="font-label-sm text-label-sm text-on-error-container uppercase tracking-wider mb-1">
              Net effect
            </div>
            <p className="font-body-sm text-body-sm text-on-surface">{limitations.net_effect}</p>
          </div>
        </div>
      </Card>

      <Card className="p-space-lg">
        <CardHeader title="Definitions" subtitle="Terms used across the app" />
        <div className="p-space-lg pt-0 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
              Whale
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{kpi.whale_definition}</p>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
              Retention
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {data.cohorts.definition}
            </p>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
              Daily active wallet
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {data.daily.definitions.dau}
            </p>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
              New wallet
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {data.daily.definitions.new_wallets}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
