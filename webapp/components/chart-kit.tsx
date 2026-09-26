"use client";

import type { ReactNode } from "react";
import { CHART_COLORS } from "@/lib/format";

export const AXIS = {
  stroke: "var(--color-outline)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: "var(--color-hairline)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

interface TipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  format,
  extra,
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  labelFormatter?: (l: string | number) => string;
  format?: (v: number, name: string) => string;
  extra?: (p: Record<string, unknown>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface-container-lowest border border-outline-variant shadow-e3 px-3 py-2">
      {label !== undefined && (
        <p className="font-label-sm text-label-sm text-outline mb-1">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {payload.map((e, i) => {
          const name = String(e.name ?? e.dataKey ?? "");
          const raw = typeof e.value === "number" ? e.value : Number(e.value ?? 0);
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: e.color ?? CHART_COLORS[0] }}
              />
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {name}
              </span>
              <span className="ml-auto font-code-sm text-code-sm font-semibold text-on-surface">
                {format ? format(raw, name) : raw.toLocaleString("en-US")}
              </span>
            </li>
          );
        })}
      </ul>
      {extra && payload[0]?.payload ? extra(payload[0].payload) : null}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <li
          key={i.label}
          className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant"
        >
          <span
            className="h-2 w-2 rounded-sm shrink-0"
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartBox({
  height = 260,
  children,
}: {
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className="w-full px-space-lg pb-space-lg" style={{ height }}>
      {children}
    </div>
  );
}

/** Sequential single-hue ramp used by both heatmaps (low -> high). */
export function heatScale(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = [0xf1, 0xf3, 0xff];
  const b = [0x0b, 0x3f, 0xa8];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * clamped));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
