import Link from "next/link";
import { cn } from "@/lib/utils";

export function LabNav({ active }: { active: "jobs" | "traces" | "search" | "ranking" }) {
  const items = [
    ["jobs", "Jobs"],
    ["traces", "Traces & events"],
    ["search", "Search internals"],
    ["ranking", "Ranking config & models"],
  ] as const;
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map(([k, label]) => (
        <Link
          key={k}
          href={`/app/lab/${k}`}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium",
            active === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
