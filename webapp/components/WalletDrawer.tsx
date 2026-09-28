"use client";

import { useEffect, useMemo, useState } from "react";
import type { WalletDetail } from "@/lib/types";
import { dec6, int, longDate, timestampLabel } from "@/lib/format";
import { Address, Card, Caveat, Mono, SEGMENT_CAVEAT, Stat } from "./ui";

export interface Filters {
  segment: string;
  fn: string;
}

export const DEFAULT_FILTERS: Filters = {
  segment: "All segments",
  fn: "All functions",
};

function matchesFn(functionName: string, fn: string) {
  if (fn === "All functions") return true;
  return functionName.toLowerCase().startsWith(fn.toLowerCase());
}

export default function WalletDrawer({
  detail,
  open,
  address,
  filters,
  onSelect,
  onClose,
  onClearSegment,
  onToast,
  onGoToSystem,
}: {
  detail: WalletDetail;
  open: boolean;
  address: string | null;
  filters: Filters;
  onSelect: (address: string) => void;
  onClose: () => void;
  onClearSegment: () => void;
  onToast: (msg: string) => void;
  onGoToSystem: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const wallets = useMemo(
    () =>
      filters.segment === "All segments"
        ? detail.wallets
        : detail.wallets.filter((w) => w.segment === filters.segment),
    [detail.wallets, filters.segment],
  );

  const wallet = address ? detail.wallets.find((w) => w.address === address) : undefined;

  const events = useMemo(() => {
    if (!wallet) return [];
    return wallet.recent_events.filter((e) => matchesFn(e.function_name, filters.fn));
  }, [wallet, filters.fn]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      onToast("Address copied to clipboard");
    } catch {
      onToast("Clipboard unavailable in this context");
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-[rgba(17,24,39,0.35)] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Wallet explorer"
        aria-hidden={!open}
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[440px] bg-surface-container-lowest border-l border-outline-variant shadow-e4 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 p-space-lg border-b border-outline-variant">
          <div className="min-w-0">
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Wallet Explorer
            </h2>
            <p className="font-body-sm text-body-sm text-outline">
              {wallet
                ? `${wallet.address_short} · rank #${wallet.rank}`
                : `${wallets.length} of ${detail.wallets.length} highest-activity wallets`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet explorer"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-low shrink-0"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-space-lg flex flex-col gap-space-lg">
          {!wallet && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Top wallets
              </span>
              {filters.segment !== "All segments" && (
                <button
                  type="button"
                  onClick={onClearSegment}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-fixed/60 text-primary border border-primary/20 font-label-sm text-label-sm font-semibold"
                >
                  {filters.segment}
                  <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                    close
                  </span>
                </button>
              )}
            </div>
          )}

          {wallet ? (
            <button
              type="button"
              onClick={() => onSelect("")}
              className="self-start inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                arrow_back
              </span>
              Back to all wallets
            </button>
          ) : null}

          {wallet ? (
            <Card className="p-space-lg gap-space-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Mono className="text-on-surface break-all">{wallet.address}</Mono>
                  <div className="flex items-center gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => copy(wallet.address)}
                      className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline"
                    >
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                        content_copy
                      </span>
                      {copied === wallet.address ? "Copied" : "Copy"}
                    </button>
                    <Address href={wallet.explorer_url} className="text-primary hover:underline">
                      Polygonscan
                    </Address>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-code-sm text-code-sm font-semibold shrink-0">
                  #{wallet.rank}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-space-lg">
                <Stat label="Transactions" value={wallet.total_transactions} />
                <Stat label="Segment" value={wallet.segment} mono={false} />
                <Stat label="First seen" value={longDate(wallet.first_seen_date)} />
                <Stat label="Last seen" value={longDate(wallet.last_seen_date)} />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                    Recent transactions
                  </h3>
                  <span className="font-code-sm text-code-sm text-outline">
                    {events.length}/{wallet.recent_events.length}
                  </span>
                </div>

                {filters.fn !== "All functions" && (
                  <p className="font-label-sm text-label-sm text-primary mb-2">
                    Filtered to {filters.fn} calls
                  </p>
                )}

                {events.length === 0 ? (
                  <p className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3 font-body-sm text-body-sm text-on-surface-variant">
                    No {filters.fn} calls among this wallet&apos;s{" "}
                    {wallet.recent_events.length} most recent transactions.
                  </p>
                ) : (
                  <div className="overflow-x-auto -mx-space-lg">
                    <table className="w-full min-w-[420px]">
                      <thead>
                        <tr className="bg-surface-container-low text-outline">
                          <th className="text-left font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                            Time
                          </th>
                          <th className="text-left font-label-sm text-label-sm font-medium px-2 py-2 border-b border-outline-variant">
                            Function
                          </th>
                          <th className="text-right font-label-sm text-label-sm font-medium px-2 py-2 border-b border-outline-variant">
                            Gas $
                          </th>
                          <th className="text-right font-label-sm text-label-sm font-medium px-space-lg py-2 border-b border-outline-variant">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((ev) => (
                          <tr
                            key={ev.tx_hash}
                            className="hover:bg-surface-container-low transition-colors"
                          >
                            <td className="px-space-lg py-2 border-b border-outline-variant/40">
                              <a
                                href={ev.explorer_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-code-sm text-code-sm text-on-surface hover:underline"
                              >
                                {timestampLabel(ev.timestamp)}
                              </a>
                              <span className="block font-code-sm text-code-sm text-outline">
                                #{ev.block_number}
                              </span>
                            </td>
                            <td className="px-2 py-2 border-b border-outline-variant/40">
                              <span className="font-code-sm text-code-sm text-on-surface break-all">
                                {ev.function_name.split("(")[0]}
                              </span>
                              <span className="block font-code-sm text-code-sm text-outline">
                                {ev.method_id}
                              </span>
                            </td>
                            <td className="px-2 py-2 border-b border-outline-variant/40 text-right font-code-sm text-code-sm text-on-surface">
                              {dec6(ev.gas_cost_usd)}
                            </td>
                            <td className="px-space-lg py-2 border-b border-outline-variant/40 text-right">
                              <span
                                className={`inline-flex items-center gap-1 font-label-sm text-label-sm ${
                                  ev.status === 1 ? "text-tertiary" : "text-error"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    ev.status === 1 ? "bg-tertiary" : "bg-error"
                                  }`}
                                />
                                {ev.status === 1 ? "OK" : "Failed"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="font-body-sm text-body-sm text-outline border-t border-outline-variant/40 pt-3">
                {detail.note}
              </p>
            </Card>
          ) : (
            <>
              {wallets.length === 0 ? (
                <p className="rounded-lg bg-surface-container-low border border-outline-variant/60 p-3 font-body-sm text-body-sm text-on-surface-variant">
                  No wallets in the <strong>{filters.segment}</strong> segment.{" "}
                  <button
                    type="button"
                    onClick={onClearSegment}
                    className="text-primary hover:underline"
                  >
                    Clear filter
                  </button>
                </p>
              ) : (

                <ul className="flex flex-col gap-1 -mx-1">
                  {wallets.map((w) => (
                    <li key={w.address} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelect(w.address)}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-surface-container-low"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Mono className="text-outline w-6 shrink-0">
                            {String(w.rank).padStart(2, "0")}
                          </Mono>
                          <span className="min-w-0">
                            <span className="block font-code-sm text-code-sm text-on-surface truncate">
                              {w.address_short}
                            </span>
                            <span className="block font-label-sm text-label-sm text-outline truncate">
                              {w.segment}
                            </span>
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-code-sm text-code-sm font-semibold text-on-surface">
                            {int(w.total_transactions)}
                          </span>
                          <span className="block font-label-sm text-label-sm text-outline">
                            tx
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(w.address)}
                        aria-label={`Copy ${w.address}`}
                        title="Copy address"
                        className="shrink-0 p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container-low transition-colors"
                      >
                        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                          content_copy
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Sits outside the ternary so the disclosure is present in both
                  the populated and the empty state, not just one of them. */}
              <p className="mt-3 border-t border-outline-variant/40 pt-3">
                <Caveat onNavigate={onGoToSystem}>{SEGMENT_CAVEAT}</Caveat>
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
