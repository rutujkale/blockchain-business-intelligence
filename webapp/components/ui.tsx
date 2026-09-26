import type { ReactNode } from "react";
import { int } from "@/lib/format";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-surface-container-lowest border border-outline-variant/80 shadow-e1 flex flex-col ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 p-space-lg pb-0">
      <div className="min-w-0">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          {title}
        </h2>
        {subtitle && (
          <p className="font-body-sm text-body-sm text-outline mt-0.5">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto p-space-lg pt-0 text-body-sm text-body-sm text-outline">
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon,
  hint,
  badge,
  accent = false,
}: {
  label: string;
  value: string;
  icon: string;
  hint?: string;
  badge?: { text: string; tone: "good" | "bad" | "neutral" | "accent" };
  accent?: boolean;
}) {
  const badgeClass =
    badge?.tone === "good"
      ? "text-tertiary bg-surface-container-high"
      : badge?.tone === "bad"
        ? "text-error bg-error-container/60"
        : badge?.tone === "accent"
          ? "text-primary bg-primary-fixed/60"
          : "text-outline";
  return (
    <Card className="p-space-lg justify-between hover:border-outline transition-colors">
      <div className="flex items-center justify-between text-outline mb-1">
        <span className="font-label-md text-label-md font-medium">{label}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div
        className={`font-headline-xl text-headline-xl font-bold tracking-tight ${
          accent ? "text-primary" : "text-on-surface"
        }`}
      >
        {value}
      </div>
      <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-outline-variant/40 min-w-0">
        {hint && (
          <span className="font-body-sm text-body-sm text-outline leading-snug break-words">
            {hint}
          </span>
        )}
        {badge && (
          <span className="self-start">
            <span
              className={`inline-block font-code-sm text-code-sm font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}
            >
              {badge.text}
            </span>
          </span>
        )}
      </div>
    </Card>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "text-outline border-outline-variant/50 bg-surface-container-low",
    good: "text-tertiary border-tertiary/25 bg-tertiary-fixed/30",
    bad: "text-error border-error/25 bg-error-container/50",
    accent: "text-primary border-primary/20 bg-primary-fixed/50",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold border ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Mono({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-code-sm text-code-sm ${className}`}>{children}</span>
  );
}

/**
 * docs/limitations.md and the revised spec both require that every monetary or
 * value figure on the site links the reader to the System page. Render this
 * next to any such figure.
 */
export function Caveat({
  children,
  onNavigate,
}: {
  children?: ReactNode;
  onNavigate?: () => void;
}) {
  const body = children ?? "Native-value data is degenerate; see System.";
  if (!onNavigate) {
    return (
      <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          info
        </span>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onNavigate}
      title="Open System"
      className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline hover:text-primary transition-colors text-left"
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
        info
      </span>
      {body}
    </button>
  );
}

export function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-label-sm text-label-sm text-outline">{label}</span>
      <span
        className={
          mono
            ? "font-code-md text-code-md font-semibold text-on-surface"
            : "font-headline-sm text-headline-sm font-semibold text-on-surface"
        }
      >
        {typeof value === "number" ? int(value) : value}
      </span>
    </div>
  );
}

export function Address({
  children,
  href,
  className = "",
}: {
  children: ReactNode;
  href?: string;
  className?: string;
}) {
  const cls = `font-code-sm text-code-sm ${className}`;
  if (!href) return <span className={cls}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} inline-flex items-center gap-1 hover:underline`}
    >
      {children}
      <span className="material-symbols-outlined text-[13px] opacity-50" aria-hidden="true">
        open_in_new
      </span>
    </a>
  );
}
