export const CHART_COLORS = [
  "#1D9E75",
  "#7F77DD",
  "#2E7FD1",
  "#BA7517",
  "#E0577B",
  "#4EBFAE",
  "#9B8AE8",
  "#6B7280",
] as const;

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nf2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfCache = new Map<number, Intl.NumberFormat>();
const nf = (digits: number) => {
  let f = nfCache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    nfCache.set(digits, f);
  }
  return f;
};
const nf4 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const nf6 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export const int = (n: number) => nf0.format(n);
export const dec1 = (n: number) => nf1.format(n);
export const dec2 = (n: number) => nf2.format(n);
export const dec4 = (n: number) => nf4.format(n);
export const dec6 = (n: number) => nf6.format(n);
export const pct = (n: number, digits = 1) =>
  `${digits === 0 ? int(n) : nf(digits).format(n)}%`;

export function compact(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k >= 100 || Number.isInteger(k) ? int(k) : nf1.format(k)}k`;
  }
  return int(n);
}

/**
 * Adds thousands separators to the bare integers embedded in prose that comes
 * from a payload, e.g. kpi_summary.json's `whale_definition` string, which
 * reads "1% of 18968 distinct senders" while every figure around it is
 * grouped. Runs of four or more digits only, so hex addresses, dates and
 * block numbers inside a sentence are left alone.
 */
export function thousands(text: string): string {
  return text.replace(/\d{4,}(?![,\d])/g, (run) => int(Number(run)));
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-04" -> "Apr" */
export function monthTick(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso;
}

/** "April 2026" -> "Apr" (used to shorten Recharts tick labels). */
export function shortMonthLabel(label: string): string {
  const head = label.split(" ")[0];
  if (head.length <= 3) return head;
  const i = MONTHS.findIndex((m) => m.toLowerCase() === head.slice(0, 3).toLowerCase());
  return i === -1 ? head : MONTHS[i];
}

/** "2026-04-30" -> "Apr 30" */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/** "2026-04-30" -> "Apr 30, 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function timestampLabel(iso: string): string {
  const t = iso.replace("T", " ").replace(/\+00:00$/, "");
  return t.slice(0, 16) + " UTC";
}

export function explorerAddress(address: string): string {
  return `https://polygonscan.com/address/${address}`;
}
