"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dataset } from "@/lib/dataset";
import { pageById } from "@/lib/nav";
import { downloadCsv, toCsv } from "@/lib/csv";
import { int, pct } from "@/lib/format";
import { Sidebar } from "./Sidebar";
import TopBar, { type ExportItem } from "./TopBar";
import Toast from "./Toast";
import WalletDrawer, { DEFAULT_FILTERS, type Filters } from "./WalletDrawer";
import FilterModal from "./FilterModal";
import Overview from "./pages/Overview";
import CustomerIntelligence from "./pages/CustomerIntelligence";
import Retention from "./pages/Retention";
import Operations from "./pages/Operations";
import Analytics from "./pages/Analytics";
import Insights from "./pages/Insights";
import System from "./pages/System";

export default function Dashboard({ data }: { data: Dataset }) {
  const [page, setPage] = useState("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAddress, setDrawerAddress] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const navigate = useCallback((id: string) => {
    setPage(id);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  /** Open the explorer. With no address it shows the wallet list. */
  const openWallet = useCallback((address?: string) => {
    setDrawerAddress(address ?? null);
    setDrawerOpen(true);
    setNavOpen(false);
  }, []);

  const closeWallet = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const activeFilterCount =
    (filters.segment !== DEFAULT_FILTERS.segment ? 1 : 0) +
    (filters.fn !== DEFAULT_FILTERS.fn ? 1 : 0);

  /** Wallets after the segment filter — the only per-row segment in the payloads. */
  const filteredWallets = useMemo(
    () =>
      filters.segment === DEFAULT_FILTERS.segment
        ? data.topWallets.wallets
        : data.topWallets.wallets.filter((w) => w.segment === filters.segment),
    [data.topWallets.wallets, filters.segment],
  );

  const exports = useMemo<ExportItem[]>(() => {
    const items: ExportItem[] = [
      {
        id: "segments",
        label: "Segment summary",
        icon: "table_chart",
        tone: "good",
        run: () =>
          downloadCsv(
            "chainbi_segments.csv",
            toCsv(
              ["segment", "wallet_count", "pct_of_wallets", "pct_of_volume", "avg_transactions"],
              data.segments.segments.map((s) => [
                s.segment,
                s.wallet_count,
                s.pct_of_wallets,
                s.pct_of_volume,
                s.avg_transactions,
              ]),
            ),
          ),
      },
      {
        id: "wallets",
        label: "Top wallets",
        icon: "account_balance_wallet",
        tone: "primary",
        run: () =>
          downloadCsv(
            "chainbi_top_wallets.csv",
            toCsv(
              [
                "rank",
                "address",
                "segment",
                "total_transactions",
                "share_pct",
                "first_seen_date",
                "last_seen_date",
              ],
              filteredWallets.map((w, i) => [
                i + 1,
                w.address,
                w.segment,
                w.total_transactions,
                w.share_pct,
                w.first_seen_date,
                w.last_seen_date,
              ]),
            ),
          ),
      },
      {
        id: "cohorts",
        label: "Cohort retention matrix",
        icon: "analytics",
        tone: "primary",
        run: () => {
          const width = Math.max(
            ...data.cohorts.cohorts.map((c) => c.retention.length),
          );
          const headers = [
            "cohort_month",
            "cohort_size",
            ...Array.from({ length: width }, (_, i) => `M${i}`),
          ];
          downloadCsv(
            "chainbi_cohort_retention.csv",
            toCsv(
              headers,
              data.cohorts.cohorts.map((c) => [
                c.cohort_month,
                c.cohort_size,
                ...c.retention,
              ]),
            ),
          );
        },
      },
      {
        id: "functions",
        label: "Function mix",
        icon: "functions",
        tone: "good",
        run: () =>
          downloadCsv(
            "chainbi_function_mix.csv",
            toCsv(
              ["function", "tx_count", "pct_of_total"],
              data.functions.mix.map((m) => [m.function, m.tx_count, m.pct_of_total]),
            ),
          ),
      },
      {
        id: "monthly",
        label: "Monthly activity",
        icon: "calendar_month",
        tone: "primary",
        run: () =>
          downloadCsv(
            "chainbi_monthly_activity.csv",
            toCsv(
              [
                "month",
                "monthly_active_wallets",
                "new_wallets",
                "returning_wallets",
                "tx_count",
                "failed_tx_count",
                "whale_tx_count",
                "total_gas_usd",
                "total_volume_pol",
              ],
              data.monthly.map((m) => [
                m.month,
                m.monthly_active_wallets,
                m.new_wallets,
                m.returning_wallets,
                m.tx_count,
                m.failed_tx_count,
                m.whale_tx_count,
                m.total_gas_usd,
                m.total_volume_pol,
              ]),
            ),
          ),
      },
    ];
    return items;
  }, [data, filteredWallets]);

  const pageDef = pageById(page);
  const kpi = data.kpi;

  return (
    <div className="min-h-screen bg-surface">
      <aside className="hidden lg:block fixed top-0 left-0 bottom-0 w-[230px] z-40 bg-surface-container-lowest border-r border-outline-variant p-space-md select-none">
        <Sidebar
          active={page}
          meta={data.meta}
          onNavigate={navigate}
          onOpenWallet={() => openWallet()}
          onOpenSystem={() => navigate("system")}
        />
      </aside>

      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-[rgba(17,24,39,0.35)]"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute top-0 left-0 bottom-0 w-[260px] z-50 bg-surface-container-lowest border-r border-outline-variant p-space-md shadow-e4">
            <Sidebar
              active={page}
              meta={data.meta}
              onNavigate={navigate}
              onOpenWallet={() => openWallet()}
              onOpenSystem={() => navigate("system")}
              onClose={() => setNavOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="lg:ml-[230px] min-h-screen flex flex-col bg-surface">
        <TopBar
          page={pageDef}
          dateRange={kpi.date_range}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFiltersOpen(true)}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          onRefresh={() => {
            setRefreshing(true);
            setTimeout(() => {
              setRefreshing(false);
              showToast(
                `Data is static — ${int(kpi.total_transactions)} transactions baked at build time`,
              );
            }, 700);
          }}
          refreshing={refreshing}
          exports={exports}
          onOpenNav={() => setNavOpen(true)}
        />

        <main className="flex-1 p-3 sm:p-space-xl max-w-[1600px] w-full mx-auto">
          {page === "overview" && (
            <Overview
              data={data}
              onGoToSystem={() => navigate("system")}
              onOpenWallet={() => openWallet()}
            />
          )}
          {page === "customer-intelligence" && <CustomerIntelligence data={data} />}
          {page === "retention" && <Retention data={data} />}
          {page === "operations" && (
            <Operations
              data={data}
              filters={filters}
              onGoToSystem={() => navigate("system")}
              onSelectWallet={(address) => openWallet(address)}
              onClearFilters={() => setFilters(DEFAULT_FILTERS)}
            />
          )}
          {page === "analytics" && (
            <Analytics data={data} onGoToSystem={() => navigate("system")} />
          )}
          {page === "insights" && <Insights data={data} />}
          {page === "system" && <System data={data} />}
        </main>

        <footer className="px-3 sm:px-space-xl py-space-lg border-t border-outline-variant/80">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="font-body-sm text-body-sm text-outline">
              {data.meta.protocol} on {data.meta.chain} · {int(kpi.total_transactions)}{" "}
              transactions · {int(kpi.date_range.days)} days
            </span>
            <span className="font-body-sm text-body-sm text-outline">
              Top {pct(kpi.whale_concentration_pct)} of activity from{" "}
              {int(kpi.whale_wallet_count)} wallets
            </span>
          </div>
        </footer>
      </div>

      <WalletDrawer
        detail={data.walletDetail}
        open={drawerOpen}
        address={drawerAddress}
        filters={filters}
        onSelect={(address) => setDrawerAddress(address || null)}
        onClose={closeWallet}
        onClearSegment={() =>
          setFilters((f) => ({ ...f, segment: DEFAULT_FILTERS.segment }))
        }
        onToast={showToast}
      />

      <FilterModal
        open={filtersOpen}
        segments={data.segments.segments}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          const n =
            (next.segment !== DEFAULT_FILTERS.segment ? 1 : 0) +
            (next.fn !== DEFAULT_FILTERS.fn ? 1 : 0);
          showToast(
            n === 0
              ? "Filters cleared"
              : `Applied ${n} filter${n > 1 ? "s" : ""}: ${next.segment} · ${next.fn}`,
          );
        }}
      />

      <Toast message={toast} />
    </div>
  );
}
