import Link from "next/link";
import { cn } from "@/lib/utils";

export function SettingsNav({ active }: { active: "organization" | "team" | "integrations" }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-line">
      {(["organization", "team", "integrations"] as const).map((k) => (
        <Link
          key={k}
          href={`/app/settings/${k}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium capitalize",
            active === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {k}
        </Link>
      ))}
    </div>
  );
}
