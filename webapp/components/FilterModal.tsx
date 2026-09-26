"use client";

import { useEffect, useState } from "react";
import type { SegmentRow } from "@/lib/types";
import { int } from "@/lib/format";
import { DEFAULT_FILTERS, type Filters } from "./WalletDrawer";

const SEGMENTS = [
  "Occasional Users",
  "Frequent Users",
  "High-Value Active",
  "High-Value Dormant",
  "Dormant",
  "Emerging",
  "New",
];

const FUNCS = ["supply", "withdraw", "borrow", "repay", "Other"];

export default function FilterModal({
  open,
  segments,
  value,
  onClose,
  onApply,
}: {
  open: boolean;
  segments: SegmentRow[];
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const [segment, setSegment] = useState(value.segment);
  const [fn, setFn] = useState(value.fn);

  useEffect(() => {
    if (open) {
      setSegment(value.segment);
      setFn(value.fn);
    }
  }, [open, value.segment, value.fn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const segmentCounts = new Map(segments.map((s) => [s.segment, s.wallet_count]));

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-[rgba(17,24,39,0.35)] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className={`fixed z-50 bg-surface-container-lowest shadow-e4 flex flex-col transition-all duration-200 inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-outline-variant ${
          open
            ? "opacity-100 sm:translate-x-0"
            : "opacity-0 pointer-events-none sm:translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 p-space-lg border-b border-outline-variant">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Filters
            </h2>
            <p className="font-body-sm text-body-sm text-outline">
              Narrow the wallet tables and activity lists.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-space-lg flex flex-col gap-space-xl">
          <fieldset>
            <legend className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
              RFM Segment
            </legend>
            <div className="flex flex-col gap-1">
              {["All segments", ...SEGMENTS].map((s) => (
                <label
                  key={s}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-body-sm text-on-surface hover:bg-surface-container-low cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="segment"
                      value={s}
                      checked={segment === s}
                      onChange={() => setSegment(s)}
                      className="text-primary-container focus:ring-primary-container"
                    />
                    {s}
                  </span>
                  {s !== "All segments" && (
                    <span className="font-code-sm text-code-sm text-outline">
                      {int(segmentCounts.get(s) ?? 0)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-label-sm text-label-sm text-outline uppercase tracking-wider mb-2">
              Protocol Function
            </legend>
            <div className="flex flex-col gap-1">
              {["All functions", ...FUNCS].map((f) => (
                <label
                  key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm text-on-surface hover:bg-surface-container-low cursor-pointer"
                >
                  <input
                    type="radio"
                    name="function"
                    value={f}
                    checked={fn === f}
                    onChange={() => setFn(f)}
                    className="text-primary-container focus:ring-primary-container"
                  />
                  {f}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="p-space-lg border-t border-outline-variant flex items-center justify-between gap-2">
          <span className="font-body-sm text-body-sm text-outline min-w-0 truncate">
            {segment === DEFAULT_FILTERS.segment && fn === DEFAULT_FILTERS.fn
              ? "No filters active"
              : `${segment} · ${fn}`}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSegment(DEFAULT_FILTERS.segment);
                setFn(DEFAULT_FILTERS.fn);
                onApply(DEFAULT_FILTERS);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low font-label-md text-label-md text-on-surface transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                onApply({ segment, fn });
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md font-semibold transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
