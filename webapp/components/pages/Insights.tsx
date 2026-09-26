"use client";

import { useState } from "react";
import type { Dataset } from "@/lib/dataset";
import { Card, CardFooter, CardHeader, Chip, KpiCard } from "../ui";

const CONFIDENCE_TONE = {
  High: "good",
  Medium: "accent",
  Low: "bad",
} as const;

const PRIORITY_TONE = {
  High: "bad",
  Medium: "accent",
  Low: "neutral",
} as const;

function confidenceTone(c: string) {
  return CONFIDENCE_TONE[c as keyof typeof CONFIDENCE_TONE] ?? "neutral";
}

function priorityTone(p: string) {
  return PRIORITY_TONE[p as keyof typeof PRIORITY_TONE] ?? "neutral";
}

export default function InsightsPage({ data }: { data: Dataset }) {
  const { findings, recommendations } = data;
  const [tab, setTab] = useState<"findings" | "recommendations">("findings");
  const [open, setOpen] = useState<string | null>(findings.findings[0]?.id ?? null);

  const highPriority = recommendations.recommendations.filter(
    (r) => r.priority === "High",
  ).length;

  return (
    <div className="flex flex-col gap-gutter-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        <KpiCard
          label="Findings"
          value={String(findings.findings.length)}
          icon="lightbulb"
          hint="From the audit report"
        />
        <KpiCard
          label="Recommendations"
          value={String(recommendations.recommendations.length)}
          icon="task_alt"
          hint="Actionable next steps"
          badge={{ text: `${highPriority} high`, tone: "bad" }}
        />
        <KpiCard
          label="High Confidence"
          value={String(findings.findings.filter((f) => f.confidence === "High").length)}
          icon="verified"
          hint="Direct ledger counts"
          badge={{ text: "No estimation", tone: "good" }}
        />
        <KpiCard
          label="Growth Signal"
          value="None"
          icon="trending_flat"
          hint="Activity collapsed after April"
          accent
          badge={{ text: "Do not market growth", tone: "bad" }}
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-outline-variant p-1 self-start">
        {(["findings", "recommendations"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded font-label-md text-label-md font-semibold transition-colors ${
              tab === t
                ? "bg-surface-container-low text-primary"
                : "text-outline hover:text-on-surface"
            }`}
          >
            {t === "findings" ? "Findings" : "Recommendations"}
          </button>
        ))}
      </div>

      {tab === "findings" ? (
        <div className="flex flex-col gap-2">
          {findings.findings.map((f) => {
            const expanded = open === f.id;
            return (
              <Card key={f.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : f.id)}
                  aria-expanded={expanded}
                  className="w-full text-left p-space-lg flex items-start gap-3 hover:bg-surface-container-low transition-colors rounded-xl"
                >
                  <span className="font-code-sm text-code-sm font-semibold text-primary w-8 shrink-0 pt-0.5">
                    {f.id}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                        {f.title}
                      </span>
                      <Chip tone={confidenceTone(f.confidence)}>{f.confidence} confidence</Chip>
                    </span>
                    {!expanded && (
                      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                        {f.business_impact}
                      </span>
                    )}
                  </span>
                  <span
                    className={`material-symbols-outlined text-outline transition-transform shrink-0 ${
                      expanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>

                {expanded && (
                  <div className="px-space-lg pb-space-lg flex flex-col gap-space-lg">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {f.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3"
                        >
                          <div className="font-label-sm text-label-sm text-outline">{m.label}</div>
                          <div className="font-code-md text-code-md font-semibold text-on-surface">
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
                        Business impact
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {f.business_impact}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
                        Evidence
                      </h4>
                      <p className="font-code-sm text-code-sm text-outline break-words">{f.evidence}</p>
                    </div>
                    <div>
                      <h4 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
                        Confidence note
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {f.confidence_note}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recommendations.recommendations.map((r) => (
            <Card key={r.id} className="p-space-lg gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-code-sm text-code-sm font-semibold text-primary">{r.id}</span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  {r.title}
                </h3>
                <Chip tone={priorityTone(r.priority)}>{r.priority} priority</Chip>
                <Chip>{r.category}</Chip>
                <Chip>{r.owner}</Chip>
              </div>
              <div>
                <h4 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
                  Rationale
                </h4>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{r.rationale}</p>
              </div>
              <div className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3">
                <h4 className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-1">
                  Next step
                </h4>
                <p className="font-body-sm text-body-sm text-on-surface">{r.next_step}</p>
              </div>
              <CardFooter>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-label-sm text-label-sm text-outline">Addresses findings:</span>
                  {r.maps_to.map((m) => (
                    <span
                      key={m}
                      className="font-code-sm text-code-sm px-1.5 py-0.5 rounded bg-surface-container text-primary font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-space-lg">
        <CardHeader title="Sources" subtitle="Every card on this page is verbatim" />
        <div className="p-space-lg pt-0 flex flex-col gap-1">
          <span className="font-code-sm text-code-sm text-outline">{findings.source}</span>
          <span className="font-code-sm text-code-sm text-outline">{recommendations.source}</span>
        </div>
      </Card>
    </div>
  );
}
