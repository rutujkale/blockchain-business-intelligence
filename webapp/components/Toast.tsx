"use client";

export default function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] transition-all duration-200 ${
        message ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-inverse-surface text-inverse-on-surface shadow-e3">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          check_circle
        </span>
        <span className="font-label-md text-label-md">{message}</span>
      </div>
    </div>
  );
}
