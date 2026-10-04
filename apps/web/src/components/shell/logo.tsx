import { cn } from "@/lib/utils";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path
          d="M7 23c5-1 9-5 11-10"
          stroke="var(--accent)"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="21" cy="10" r="3.4" className="fill-bg" />
      </svg>
      {!mark && <span className="text-[15px]">Trajectory</span>}
    </span>
  );
}
