"use client";

import { useEffect, useRef, useState } from "react";
import type { PageDef } from "@/lib/nav";
import { longDate } from "@/lib/format";

export interface ExportItem {
  id: string;
  label: string;
  icon: string;
  tone: "bad" | "good" | "primary";
  run: () => void;
}

const EXPORT_TONE = {
  bad: "text-error",
  good: "text-tertiary",
  primary: "text-primary",
} as const;

export default function TopBar({
  page,
  dateRange,
  activeFilterCount,
  onOpenFilters,
  onClearFilters,
  onRefresh,
  refreshing,
  exports,
  onOpenNav,
}: {
  page: PageDef;
  dateRange: { start: string; end: string };
  activeFilterCount: number;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  exports: ExportItem[];
  onOpenNav: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-space-xl py-space-md w-full bg-surface-container-lowest border-b border-outline-variant">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="p-1.5 rounded-lg border border-outline-variant text-outline hover:text-on-surface lg:hidden shrink-0"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            menu
          </span>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight truncate">
              {page.label}
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-primary font-code-sm text-code-sm font-semibold shrink-0">
              Polygon v3
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant hidden sm:block truncate">
            {page.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest">
          <span className="material-symbols-outlined text-outline text-[16px]" aria-hidden="true">
            calendar_today
          </span>
          <span className="font-label-md text-label-md whitespace-nowrap">
            {longDate(dateRange.start)} — {longDate(dateRange.end)}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenFilters}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low text-on-surface transition-all duration-150 active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-outline text-[16px]" aria-hidden="true">
            tune
          </span>
          <span className="font-label-md text-label-md hidden md:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-primary-container text-on-primary font-code-sm text-code-sm flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            aria-label="Clear all filters"
            title="Clear all filters"
            className="p-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-outline hover:text-on-surface transition-all duration-150 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              filter_alt_off
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Reload data"
          className="p-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low text-outline hover:text-on-surface transition-all duration-150 active:scale-[0.98]"
        >
          <span
            className={`material-symbols-outlined text-[18px] ${
              refreshing ? "animate-spin" : ""
            }`}
            aria-hidden="true"
          >
            refresh
          </span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md font-semibold transition-all duration-150 active:scale-[0.98] shadow-e1"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              download
            </span>
            <span className="hidden sm:inline">Export</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-e3 py-1 z-50">
              <p className="px-3 pt-1.5 pb-1 font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Export as CSV
              </p>
              {exports.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    e.run();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low flex items-center gap-2"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      EXPORT_TONE[e.tone]
                    }`}
                    aria-hidden="true"
                  >
                    {e.icon}
                  </span>
                  {e.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
