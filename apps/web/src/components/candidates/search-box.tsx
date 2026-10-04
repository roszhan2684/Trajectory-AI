"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "typescript engineers in SF open to seed stage",
  "search ranking elasticsearch",
  "LLM product engineer 5+ years remote",
  "healthcare frontend accessibility",
];

export function SearchBox({ initial, mode }: { initial: string; mode: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(initial);
  const [pending, start] = React.useTransition();

  const push = React.useCallback(
    (value: string, m = mode) => {
      const u = new URLSearchParams(params.toString());
      if (value) u.set("q", value);
      else u.delete("q");
      u.set("mode", m);
      u.delete("page");
      start(() => router.replace(`${path}?${u.toString()}`));
    },
    [params, path, router, mode],
  );

  React.useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => push(q), 220);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search
            className={cn(
              "absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted",
              pending && "animate-pulse text-accent",
            )}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search in plain language — “LLM engineers in SF, 5+ years, seed stage”"
            aria-label="Search candidates"
            className="h-10 w-full rounded-xl border border-line bg-panel pl-9 pr-3 text-sm text-ink shadow-panel outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <div
          className="flex rounded-xl border border-line bg-panel p-0.5 shadow-panel"
          role="radiogroup"
          aria-label="Search mode"
        >
          {["hybrid", "keyword", "semantic"].map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => push(q, m)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition",
                mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {!q && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => setQ(e)}
              className="rounded-full border border-line px-2.5 py-0.5 text-muted hover:border-line-strong hover:text-ink"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
