export interface PageDef {
  id: string;
  label: string;
  icon: string;
  group: string;
  subtitle: string;
}

export const PAGES: PageDef[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "dashboard",
    group: "Overview",
    subtitle:
      "Business intelligence and behavioral audit for Aave V3 activity on Polygon",
  },
  {
    id: "customer-intelligence",
    label: "Customer Intelligence",
    icon: "group",
    group: "Overview",
    subtitle: "RFM segmentation of every wallet that touched the Pool",
  },
  {
    id: "retention",
    label: "Retention Analysis",
    icon: "repeat",
    group: "Overview",
    subtitle: "Month-over-month cohort retention and the month-1 cliff",
  },
  {
    id: "operations",
    label: "Operations",
    icon: "hub",
    group: "Overview",
    subtitle: "Gas, throughput, timing concentration and top-wallet activity",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "analytics",
    group: "Analytics",
    subtitle: "Function mix, protocol event mix and usage composition",
  },
  {
    id: "insights",
    label: "Insights",
    icon: "lightbulb",
    group: "Insights",
    subtitle: "Findings and recommended actions, straight from the report",
  },
  {
    id: "system",
    label: "System",
    icon: "settings",
    group: "System",
    subtitle: "Pipeline provenance, data quality and known limitations",
  },
];

export const GROUPS = ["Overview", "Analytics", "Insights", "System"] as const;

export const pageById = (id: string) =>
  PAGES.find((p) => p.id === id) ?? PAGES[0];
