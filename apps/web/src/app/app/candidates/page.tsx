import Link from "next/link";
import { Plus } from "lucide-react";
import { METRO_BY_KEY, SKILL_BY_KEY, type SearchFilters } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { searchCandidates, SEARCH_ADAPTER } from "@/server/services/search";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { SearchBox } from "@/components/candidates/search-box";
import { cn } from "@/lib/utils";

export const metadata = { title: "Candidates" };

type SP = {
  q?: string;
  mode?: string;
  skill?: string | string[];
  metro?: string;
  stage?: string;
  years?: string;
  remote?: string;
  auth?: string;
  page?: string;
};
const arr = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function qs(sp: SP, patch: Partial<Record<keyof SP, string | string[] | null>>) {
  const u = new URLSearchParams();
  const merged = { ...sp, ...patch } as Record<string, string | string[] | null | undefined>;
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === undefined || v === "") continue;
    for (const x of Array.isArray(v) ? v : [v]) u.append(k, x);
  }
  const s = u.toString();
  return s ? `/app/candidates?${s}` : "/app/candidates";
}

function Highlight({ text, matches }: { text: string; matches: [number, number][] }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const [a, b] of matches) {
    if (a < i) continue;
    out.push(text.slice(i, a));
    out.push(
      <mark key={a} className="evidence">
        {text.slice(a, b)}
      </mark>,
    );
    i = b;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const skills = arr(sp.skill);
  const filters: SearchFilters = {
    ...(skills.length ? { skills } : {}),
    ...(sp.metro ? { metros: [sp.metro] } : {}),
    ...(sp.stage ? { stages: sp.stage.split(",") } : {}),
    ...(sp.years ? { minYears: Number(sp.years) } : {}),
    ...(sp.remote ? { workModes: ["remote"] } : {}),
    ...(sp.auth ? { excludeNeedsSponsorship: true } : {}),
  };
  const page = Math.max(0, Number(sp.page ?? 0));
  const mode = (["hybrid", "keyword", "semantic"].includes(sp.mode ?? "") ? sp.mode : "hybrid") as
    "hybrid" | "keyword" | "semantic";
  const res = searchCandidates(actor, { q: sp.q ?? "", filters, mode, limit: 20, offset: page * 20 });
  const facet = (k: string) => res.facets[k] ?? [];

  return (
    <>
      <PageHeader
        title="Candidates"
        description={`${SEARCH_ADAPTER.name} over ${SEARCH_ADAPTER.schema}: BM25F keyword + LSA vectors fused Typesense-style. Filters are exact; ranking is relevance.`}
        actions={
          actor.caps.includes("candidates.ingest") && (
            <Button variant="primary" asChild>
              <Link href="/app/candidates/new">
                <Plus /> Ingest resume
              </Link>
            </Button>
          )
        }
      />
      <SearchBox initial={sp.q ?? ""} mode={mode} />
      {res.parsed && res.parsed.chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Interpreted as:
          {res.parsed.chips.map((c) => (
            <Badge key={c.kind + c.value} tone="accent">
              {c.kind}: {c.label}
            </Badge>
          ))}
          {res.parsed.text && <Badge tone="outline">keywords: “{res.parsed.text}”</Badge>}
        </div>
      )}
      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-5 text-[13px]" aria-label="Filters">
          <FacetGroup title="Skills">
            {facet("skills")
              .slice(0, 14)
              .map((f) => {
                const on = skills.includes(f.value);
                return (
                  <FacetLink
                    key={f.value}
                    href={qs(sp, {
                      skill: on ? skills.filter((s) => s !== f.value) : [...skills, f.value],
                      page: null,
                    })}
                    on={on}
                    label={SKILL_BY_KEY[f.value]?.display ?? f.value}
                    count={f.count}
                  />
                );
              })}
          </FacetGroup>
          <FacetGroup title="Location">
            {facet("metro")
              .slice(0, 10)
              .map((f) => (
                <FacetLink
                  key={f.value}
                  href={qs(sp, { metro: sp.metro === f.value ? null : f.value, page: null })}
                  on={sp.metro === f.value}
                  label={METRO_BY_KEY[f.value]?.label ?? f.value}
                  count={f.count}
                />
              ))}
          </FacetGroup>
          <FacetGroup title="Company stage (any past role)">
            {facet("company_stages").map((f) => (
              <FacetLink
                key={f.value}
                href={qs(sp, { stage: sp.stage === f.value ? null : f.value, page: null })}
                on={sp.stage === f.value}
                label={f.value}
                count={f.count}
              />
            ))}
          </FacetGroup>
          <FacetGroup title="Other">
            <FacetLink
              href={qs(sp, { years: sp.years ? null : "5", page: null })}
              on={!!sp.years}
              label="5+ years"
            />
            <FacetLink
              href={qs(sp, { remote: sp.remote ? null : "1", page: null })}
              on={!!sp.remote}
              label="Open to remote"
            />
            <FacetLink
              href={qs(sp, { auth: sp.auth ? null : "1", page: null })}
              on={!!sp.auth}
              label="No sponsorship needed"
            />
          </FacetGroup>
          {(skills.length || sp.metro || sp.stage || sp.years || sp.remote || sp.auth) && (
            <Link href={qs({ q: sp.q, mode: sp.mode }, {})} className="text-xs text-accent hover:underline">
              Clear filters
            </Link>
          )}
        </aside>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted" aria-live="polite">
            <span>
              {res.found} candidates · {res.mode} · {res.tookMs} ms
            </span>
            <span className="hidden sm:inline">fusion: (1−α)/(1+kw rank) + α/(1+vector rank), α = 0.3</span>
          </div>
          <Panel>
            <ul className="divide-y divide-line">
              {res.hits.map((h, i) => {
                const c = res.candidates[i]!;
                const supported = c.claims
                  .filter((cl) => cl.claimType === "skill" && cl.status === "SUPPORTED")
                  .slice(0, 5);
                return (
                  <li key={h.id} className="px-4 py-3.5 transition hover:bg-panel-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/app/candidates/${c.id}`}
                          className="text-[14px] font-semibold text-ink hover:text-accent"
                        >
                          {c.fullName}
                        </Link>
                        <span className="ml-2 text-xs text-muted">
                          {[c.city, c.region].filter(Boolean).join(", ")} · {c.yearsExperience} yrs
                        </span>
                        <div className="truncate text-[13px] text-ink-2">{c.headline}</div>
                      </div>
                      <div className="tabular flex gap-3 text-[11px] text-muted">
                        <span>kw #{h.keywordRank !== null ? h.keywordRank + 1 : "—"}</span>
                        <span>vec #{h.vectorRank !== null ? h.vectorRank + 1 : "—"}</span>
                        <span className="font-medium text-ink-2">{h.score.toFixed(3)}</span>
                      </div>
                    </div>
                    {h.highlight && (
                      <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">
                        <Highlight text={h.highlight.snippet} matches={h.highlight.matches} />
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {supported.map((cl) => (
                        <Badge key={cl.id} tone="good">
                          {cl.claimValue}
                        </Badge>
                      ))}
                      {c.flags.some((f) => f.kind === "CONFLICT") && (
                        <Badge tone="warn">conflicting sources</Badge>
                      )}
                      {c.synthetic && <Badge tone="outline">synthetic</Badge>}
                    </div>
                  </li>
                );
              })}
              {res.hits.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-muted">
                  No candidates match. Remove a filter or broaden the query.
                </li>
              )}
            </ul>
          </Panel>
          <div className="mt-3 flex justify-between">
            {page > 0 ? (
              <Button size="sm" asChild>
                <Link href={qs(sp, { page: String(page - 1) })}>← Previous</Link>
              </Button>
            ) : (
              <span />
            )}
            {(page + 1) * 20 < res.found && (
              <Button size="sm" asChild>
                <Link href={qs(sp, { page: String(page + 1) })}>Next →</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FacetLink({ href, on, label, count }: { href: string; on: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between rounded-md px-2 py-1 transition",
        on ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-subtle",
      )}
      aria-pressed={on}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="tabular text-[11px] text-faint">{count}</span>}
    </Link>
  );
}
