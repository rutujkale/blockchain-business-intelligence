import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CohortRetention,
  DailyActivityPayload,
  Findings,
  FunctionBreakdown,
  HourlyActivity,
  KpiSummary,
  Limitations,
  MonthlyActivity,
  PipelineMeta,
  Recommendations,
  SegmentSummary,
  TopWallets,
  WalletDetail,
} from "./types";

const DATA_DIR = join(process.cwd(), "public", "data");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
}

export interface Dataset {
  kpi: KpiSummary;
  monthly: MonthlyActivity[];
  daily: DailyActivityPayload;
  segments: SegmentSummary;
  cohorts: CohortRetention;
  topWallets: TopWallets;
  hourly: HourlyActivity;
  functions: FunctionBreakdown;
  walletDetail: WalletDetail;
  findings: Findings;
  recommendations: Recommendations;
  limitations: Limitations;
  meta: PipelineMeta;
}

/**
 * Every payload is read from disk during `next build` and baked into the
 * prerendered page. There is no database and no runtime data fetching.
 * Regenerate with `python src/analysis/export_for_webapp.py`.
 */
export function getDataset(): Dataset {
  return {
    kpi: read<KpiSummary>("kpi_summary.json"),
    monthly: read<MonthlyActivity[]>("monthly_activity.json"),
    daily: read<DailyActivityPayload>("daily_activity.json"),
    segments: read<SegmentSummary>("segment_summary.json"),
    cohorts: read<CohortRetention>("cohort_retention.json"),
    topWallets: read<TopWallets>("top_wallets.json"),
    hourly: read<HourlyActivity>("hourly_activity.json"),
    functions: read<FunctionBreakdown>("function_breakdown.json"),
    walletDetail: read<WalletDetail>("wallet_detail.json"),
    findings: read<Findings>("findings.json"),
    recommendations: read<Recommendations>("recommendations.json"),
    limitations: read<Limitations>("limitations.json"),
    meta: read<PipelineMeta>("pipeline_meta.json"),
  };
}
