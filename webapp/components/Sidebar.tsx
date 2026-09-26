"use client";

import Brand from "./Brand";
import { GROUPS, PAGES } from "@/lib/nav";
import type { PipelineMeta } from "@/lib/types";
import { longDate } from "@/lib/format";

const item =
  "flex w-full items-center gap-space-sm px-space-md py-space-sm rounded-lg font-label-md text-label-md transition-colors duration-150 text-left";

export function SidebarNav({
  active,
  onNavigate,
  onOpenWallet,
}: {
  active: string;
  onNavigate: (id: string) => void;
  onOpenWallet: () => void;
}) {
  return (
    <nav className="flex flex-col gap-y-4 overflow-y-auto custom-scrollbar pr-1">
      {GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <span className="px-space-md py-1 font-label-sm text-label-sm font-semibold text-outline uppercase tracking-wider">
            {group}
          </span>
          {PAGES.filter((p) => p.group === group).map((p) => {
            const isActive = p.id === active;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigate(p.id)}
                aria-current={isActive ? "page" : undefined}
                className={`${item} ${
                  isActive
                    ? "bg-surface-container-low text-primary font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {p.icon}
                </span>
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
          {group === "Analytics" && (
            <button
              type="button"
              onClick={onOpenWallet}
              className={`${item} text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                account_balance_wallet
              </span>
              <span className="flex-1 truncate text-left">Wallet Explorer</span>
              <span className="font-code-sm text-code-sm px-1.5 py-0.5 rounded bg-surface-container text-primary font-medium">
                Top
              </span>
            </button>
          )}
        </div>
      ))}
    </nav>
  );
}

export function SidebarFooter({
  meta,
  onOpenSystem,
}: {
  meta: PipelineMeta;
  onOpenSystem: () => void;
}) {
  return (
    <div className="pt-space-sm border-t border-outline-variant flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary-container opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary" />
          </span>
          <span className="font-label-sm text-label-sm text-tertiary font-semibold">
            Data Pipeline Healthy
          </span>
        </div>
      </div>
      <div className="px-2 font-code-sm text-code-sm text-outline flex items-center justify-between gap-2">
        <span>{meta.chain} v3</span>
        <span>{longDate(String(meta.date_range.end))}</span>
      </div>
      <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-surface-container-low transition-colors duration-150">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center font-bold">
            RK
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
              Rutuj Kale
            </span>
            <span className="font-code-sm text-code-sm text-outline">Lead Analytics</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSystem}
          title="System"
          className="text-outline hover:text-on-surface shrink-0"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            unfold_more
          </span>
        </button>
      </div>
      <div className="pt-1">
        <button
          type="button"
          onClick={onOpenSystem}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded font-label-sm text-label-sm text-outline hover:text-on-surface hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
            menu_book
          </span>
          Data Dictionary
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  active,
  meta,
  onNavigate,
  onOpenWallet,
  onOpenSystem,
  onClose,
}: {
  active: string;
  meta: PipelineMeta;
  onNavigate: (id: string) => void;
  onOpenWallet: () => void;
  onOpenSystem: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col justify-between h-full gap-4">
      <div className="flex flex-col gap-y-4 min-h-0">
        <div className="px-space-sm pt-space-xs pb-space-sm border-b border-outline-variant">
          <div className="flex items-center gap-2 mb-1.5">
            <Brand />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="ml-auto text-outline hover:text-on-surface lg:hidden"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            )}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
            From on-chain activity to business intelligence.
          </p>
        </div>
        <SidebarNav
          active={active}
          onNavigate={onNavigate}
          onOpenWallet={onOpenWallet}
        />
      </div>
      <SidebarFooter meta={meta} onOpenSystem={onOpenSystem} />
    </div>
  );
}
