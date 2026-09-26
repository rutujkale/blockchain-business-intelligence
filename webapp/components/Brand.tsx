"use client";

import Link from "next/link";

const base =
  "flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-colors duration-150";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="ChainBI home"
      className="flex items-center gap-2 select-none"
    >
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7 shrink-0"
        role="img"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="7" fill="var(--color-primary-container)" />
        <path
          d="M9 21.5 14 13l4 6 2.5-4L24 21.5"
          fill="none"
          stroke="var(--color-on-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="21.5" r="2" fill="var(--color-on-primary)" />
        <circle cx="24" cy="21.5" r="2" fill="var(--color-on-primary)" />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">
            ChainBI
          </span>
          <span className="font-label-sm text-label-sm text-outline mt-0.5">
            Polygon v3 Analytics
          </span>
        </span>
      )}
    </Link>
  );
}

export { base as navItemBase };
