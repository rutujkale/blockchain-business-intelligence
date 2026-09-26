export interface KpiSummary {
  monthly_active_wallets_peak: number;
  monthly_active_wallets_peak_month: string;
  monthly_active_wallets_peak_month_label: string;
  current_partial_mau: number;
  current_partial_mau_month: string;
  current_partial_mau_is_partial: boolean;
  mau_includes_pool_contract: boolean;
  total_wallets: number;
  total_transactions: number;
  total_contracts: number;
  total_token_transfers: number;
  date_range: { start: string; end: string; days: number };
  whale_concentration_pct: number;
  whale_wallet_count: number;
  whale_definition: string;
  avg_month1_retention_pct: number;
  avg_gas_cost_usd: number;
  total_gas_cost_usd: number;
  failed_tx_pct: number;
  failed_tx_count: number;
  tx_carrying_native_value: number;
  total_volume_pol: number;
  value_caveat: string;
}

export interface MonthlyActivity {
  month: string;
  month_label: string;
  monthly_active_wallets: number;
  new_wallets: number;
  returning_wallets: number;
  tx_count: number;
  failed_tx_count: number;
  whale_tx_count: number;
  total_gas_usd: number;
  total_volume_pol: number;
}

export interface DailyActivity {
  event_date: string;
  dau: number;
  new_wallets: number;
  tx_count: number;
  failed_tx_count: number;
  whale_tx_count: number;
  total_volume_pol: number;
  total_gas_usd: number;
  avg_gas_cost_usd: number;
}

export interface DailyActivityPayload {
  definitions: { dau: string; new_wallets: string };
  days: DailyActivity[];
}

export interface SegmentRow {
  segment: string;
  wallet_count: number;
  pct_of_wallets: number;
  pct_of_volume: number;
  avg_transactions: number;
}

export interface SegmentSummary {
  total_wallets: number;
  note: string;
  segments: SegmentRow[];
}

export interface CohortRow {
  cohort_month: string;
  cohort_month_label: string;
  cohort_size: number;
  retention: number[];
}

export interface CohortRetention {
  definition: string;
  avg_month1_retention_pct: number;
  cohorts: CohortRow[];
}

export interface TopWallet {
  address: string;
  address_short: string;
  explorer_url: string;
  segment: string;
  total_transactions: number;
  share_pct: number;
  first_seen_date: string;
  last_seen_date: string;
  is_contract: boolean;
}

export interface TopWallets {
  note: string;
  protocol_contract: {
    address: string;
    address_short: string;
    label: string;
    total_transactions: number;
    total_volume_pol: number;
    explorer_url: string;
    is_contract: boolean;
  };
  wallets: TopWallet[];
}

export interface HourlyActivity {
  definition: string;
  hours: number[];
  weekdays: number[];
  weekdays_long: string[];
  grid: number[][];
  peak: {
    weekday: number;
    weekday_label: string;
    hour: number;
    hour_label: string;
    tx_count: number;
  };
  finding: string;
}

export interface FunctionMixRow {
  function: string;
  tx_count: number;
  pct_of_total: number;
}

export interface FunctionBreakdown {
  total_transactions: number;
  grouping_rule: string;
  other_bucket_threshold_pct: number;
  mix: FunctionMixRow[];
  detail: FunctionMixRow[];
  headline_metrics: {
    median_gas_used: number;
    flash_loan_tx_count: number;
    flash_loan_rate_pct: number;
    liquidation_call_count: number;
    liquidation_call_rate_pct: number;
    undecoded_tx_count: number;
  };
}

export interface WalletEvent {
  tx_hash: string;
  explorer_url: string;
  block_number: number;
  timestamp: string;
  function_name: string;
  method_id: string;
  status: number;
  gas_cost_usd: number;
  value_native: number;
  is_whale_transaction: boolean;
}

export interface WalletDetailRow {
  rank: number;
  address: string;
  address_short: string;
  explorer_url: string;
  segment: string;
  total_transactions: number;
  first_seen_date: string;
  last_seen_date: string;
  total_volume_pol: number;
  recent_events: WalletEvent[];
}

export interface WalletDetail {
  note: string;
  wallets: WalletDetailRow[];
}

export interface Metric {
  label: string;
  value: string;
}

export interface Finding {
  id: string;
  title: string;
  business_impact: string;
  evidence: string;
  confidence: string;
  confidence_note: string;
  metrics: Metric[];
}

export interface Findings {
  source: string;
  findings: Finding[];
}

export interface Recommendation {
  id: string;
  title: string;
  priority: string;
  category: string;
  owner: string;
  maps_to: string[];
  rationale: string;
  next_step: string;
}

export interface Recommendations {
  source: string;
  recommendations: Recommendation[];
}

export interface Limitation {
  id: string;
  title: string;
  what: string;
  why_it_matters: string;
  mitigation: string;
}

export interface Limitations {
  source: string;
  net_effect: string;
  limitations: Limitation[];
}

export interface PipelineMeta {
  chain: string;
  chain_id: number;
  protocol: string;
  contract_address: string;
  contract_label: string;
  api: string;
  price_feed: string;
  date_range: Record<string, string | number>;
  block_range: Record<string, string | number>;
  extraction: Record<string, string | number | boolean>;
  cleaning: Record<string, string | number | boolean>;
  warehouse: Record<string, string | number | boolean>;
  webapp: Record<string, string>;
}
