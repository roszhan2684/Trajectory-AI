"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderGit2,
  MessageCircleQuestion,
  MessagesSquare,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { ConstraintStatus, MatchStatus, PreferenceProposal } from "@trajectory/engine/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tip,
} from "@/components/ui/overlays";
import {
  ConfidenceMeter,
  ConstraintBadge,
  MatchStatusBadge,
  RankDelta,
  ScoreRing,
} from "@/components/domain/score";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import { generateMatchesAction } from "@/app/actions/roles";
import { setMatchStatusAction, startQualificationAction } from "@/app/actions/matches";
import { RefineDrawer } from "./refine-drawer";
import { MovementPanel, type Movement } from "./movement-panel";
import { cn, timeAgo } from "@/lib/utils";

export interface BoardRow {
  id: string;
  rank: number;
  previousRank: number | null;
  score: number;
  previousScore: number | null;
  deterministic: number;
  semantic: number | null;
  rerank: number | null;
  confidence: number;
  constraint: ConstraintStatus;
  status: MatchStatus;
  candidate: {
    id: string;
    name: string;
    title: string;
    company: string | null;
    location: string;
    years: number | null;
    sources: string[];
    answered: boolean;
    flags: string[];
  };
  signals: string[];
  risks: string[];
  failReasons: string[];
  intent: { label: string; tone: "good" | "info" | "unknown" | "warn" };
  openQuestions: number;
}

interface Props {
  role: { id: string; title: string; status: string };
  rows: BoardRow[];
  filtered: BoardRow[];
  pool: number;
  retrieved: number;
  rerankTopN: number;
  lastRun: { at: string; trigger: string; traceId: string | null } | null;
  caps: string[];
  activePreferences: { key: string; delta: number }[];
  lastRefinement: {
    id: string;
    text: string;
    at: string;
    movement: Movement[];
    proposals: PreferenceProposal[];
  } | null;
}

const SOURCE_ICON: Record<string, [React.ElementType, string]> = {
  RESUME: [FileText, "Resume"],
  GITHUB: [FolderGit2, "GitHub metadata"],
  CONVERSATION: [MessagesSquare, "Candidate answers"],
  IMPORT: [Upload, "Profile import"],
};

const REJECT_REASONS: [string, string][] = [
  ["skills_gap", "Missing key skills"],
  ["too_junior", "Too junior"],
  ["too_senior", "Too senior / managerial"],
  ["not_startup", "No startup experience"],
  ["location", "Location"],
  ["comp", "Compensation"],
];

export function MatchBoard({
  role,
  rows,
  filtered,
  pool,
  retrieved,
  rerankTopN,
  lastRun,
  caps,
  activePreferences,
  lastRefinement,
}: Props) {
  const router = useRouter();
  const [refineOpen, setRefineOpen] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [showFiltered, setShowFiltered] = React.useState(false);
  const [limit, setLimit] = React.useState(20);
  const [hiddenRefinement, setHiddenRefinement] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const canRefine = caps.includes("ranking.refine");
  const canAsk = caps.includes("intro.request");

  const job = useJob(jobId, undefined, (j) => {
    if (j.status === "COMPLETED") {
      router.refresh();
      setAnnounce("Ranking updated.");
      setTimeout(() => setJobId(null), 2500);
    }
  });

  const rerun = async () => {
    const r = await generateMatchesAction(role.id);
    if (!r.ok) return toast.error(r.error.message);
    if (r.data.deduplicated && r.data.status === "COMPLETED")
      toast.info("Ranking is already up to date for this role version (idempotent run).");
    else setJobId(r.data.jobId);
  };

  const setStatus = async (id: string, status: MatchStatus, reason: string | null = null) => {
    const r = await setMatchStatusAction(id, status, reason);
    if (!r.ok) return toast.error(r.error.message);
    toast.success(
      status === "SHORTLISTED"
        ? "Shortlisted"
        : status === "REJECTED"
          ? "Rejected — feedback recorded"
          : "Updated",
    );
    router.refresh();
  };

  const ask = async (id: string) => {
    const r = await startQualificationAction(id);
    if (!r.ok) return toast.error(r.error.message);
    toast.success(`${r.data.sent} question${r.data.sent === 1 ? "" : "s"} sent to the candidate portal`, {
      action: { label: "Open portal", onClick: () => window.open(r.data.link, "_blank") },
    });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      {/* pipeline funnel */}
      <Panel className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <Funnel n={pool} label="in pool" />
        <Arrow />
        <Funnel
          n={retrieved}
          label="hybrid retrieval"
          tip="Typesense-style rank fusion of BM25F keyword + LSA vector search"
        />
        <Arrow />
        <Funnel
          n={filtered.length}
          label="failed hard constraints"
          tone="bad"
          tip="Deterministic PASS/FAIL/UNKNOWN. Unknown is kept and flagged — never silently failed."
        />
        <Arrow />
        <Funnel n={rows.length} label="scored · 11 features" />
        <Arrow />
        <Funnel
          n={Math.min(rerankTopN, rows.length)}
          label="reranked by fit model"
          tip="Bounded: the learned reranker only reorders the top 25 retrieved candidates."
        />
        <div className="ml-auto flex items-center gap-2">
          {lastRun && (
            <span className="hidden text-xs text-muted md:inline">
              Ranked {timeAgo(lastRun.at)} · {lastRun.trigger}
              {lastRun.traceId && caps.includes("lab.view") && (
                <Link
                  href={`/app/lab/traces?id=${lastRun.traceId}`}
                  className="ml-1.5 inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Activity className="size-3" /> trace
                </Link>
              )}
            </span>
          )}
          {caps.includes("roles.edit") && (
            <Button size="sm" onClick={rerun} disabled={!!jobId}>
              <RefreshCw className={cn(jobId && "animate-spin")} /> Re-run
            </Button>
          )}
          {canRefine && (
            <Button size="sm" variant="primary" onClick={() => setRefineOpen(true)}>
              <Wand2 /> Refine ranking
            </Button>
          )}
        </div>
      </Panel>

      {job && <JobSteps job={job} title="Re-ranking" />}

      {activePreferences.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Sparkles className="size-3.5 text-accent" /> Active recruiter preferences:
          {activePreferences.map((p) => (
            <Badge key={p.key} tone={p.delta > 0 ? "good" : "bad"}>
              {p.key.replace(/_/g, " ")} {p.delta > 0 ? "+" : ""}
              {p.delta}
            </Badge>
          ))}
        </div>
      )}

      {lastRefinement && hiddenRefinement !== lastRefinement.id && lastRefinement.movement.length > 0 && (
        <MovementPanel refinement={lastRefinement} onClose={() => setHiddenRefinement(lastRefinement.id)} />
      )}

      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[56px_minmax(220px,1.2fr)_minmax(260px,2fr)_150px_120px] gap-4 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-faint lg:grid">
          <span>Rank</span>
          <span>Candidate</span>
          <span>Evidence-backed signals · risks</span>
          <span>Fit · confidence</span>
          <span className="text-right">Actions</span>
        </div>
        <LayoutGroup>
          <ol>
            <AnimatePresence initial={false}>
              {rows.slice(0, limit).map((r) => (
                <motion.li
                  key={r.id}
                  layout
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  className="border-b border-line last:border-0"
                >
                  <div className="grid gap-3 px-4 py-3.5 transition hover:bg-panel-2 lg:grid-cols-[56px_minmax(220px,1.2fr)_minmax(260px,2fr)_150px_120px] lg:gap-4">
                    <div className="flex items-center gap-2 lg:block">
                      <div className="tabular text-lg font-semibold text-ink">#{r.rank}</div>
                      <RankDelta from={r.previousRank} to={r.rank} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/app/roles/${role.id}/matches/${r.id}`}
                        className="text-[14px] font-semibold text-ink hover:text-accent"
                      >
                        {r.candidate.name}
                      </Link>
                      <div className="truncate text-xs text-muted">
                        {r.candidate.title}
                        {r.candidate.company ? ` · ${r.candidate.company}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span>{r.candidate.location}</span>
                        {r.candidate.years !== null && <span>· {r.candidate.years} yrs</span>}
                        <span className="flex items-center gap-1" aria-label="Source coverage">
                          ·
                          {["RESUME", "GITHUB", "IMPORT", "CONVERSATION"].map((s) => {
                            const [Icon, label] = SOURCE_ICON[s]!;
                            const has =
                              r.candidate.sources.includes(s) ||
                              (s === "CONVERSATION" && r.candidate.answered);
                            return (
                              <Tip key={s} content={`${label}: ${has ? "present" : "not linked"}`}>
                                <Icon
                                  className={cn("size-3", has ? "text-ink-2" : "text-line-strong")}
                                  aria-label={`${label} ${has ? "present" : "missing"}`}
                                />
                              </Tip>
                            );
                          })}
                        </span>
                        {r.candidate.flags.includes("CONFLICT") && (
                          <Tip content="Sources disagree — surfaced, not silently resolved">
                            <ShieldAlert className="size-3 text-warn" aria-label="Conflicting sources" />
                          </Tip>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <MatchStatusBadge status={r.status} />
                        <Badge tone={r.intent.tone}>{r.intent.label}</Badge>
                        {r.constraint !== "PASS" && <ConstraintBadge status={r.constraint} />}
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1 text-[12.5px]">
                      {r.signals.map((s, i) => (
                        <div key={i} className="flex gap-1.5 text-ink-2">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-good" />
                          <span className="line-clamp-1">{s}</span>
                        </div>
                      ))}
                      {r.risks.map((s, i) => (
                        <div key={i} className="flex gap-1.5 text-muted">
                          <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-unknown" />
                          <span className="line-clamp-1">{s}</span>
                        </div>
                      ))}
                      {r.signals.length === 0 && (
                        <div className="text-xs text-faint">Explanation generated when opened.</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 lg:block lg:space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <ScoreRing value={r.score} size={42} label="Mutual fit" />
                        <div className="text-[11px] leading-tight text-muted">
                          <Tip content="Deterministic features (65%) · semantic relevance (20%) · learned fit model (15%)">
                            <span>
                              det {Math.round(r.deterministic * 100)}
                              <br />
                              sem {r.semantic !== null ? Math.round(r.semantic * 100) : "—"} · fit{" "}
                              {r.rerank !== null ? Math.round(r.rerank * 100) : "—"}
                            </span>
                          </Tip>
                        </div>
                      </div>
                      <ConfidenceMeter value={r.confidence} />
                    </div>
                    <div className="flex items-start justify-end gap-1.5">
                      <Button size="sm" asChild>
                        <Link href={`/app/roles/${role.id}/matches/${r.id}`}>Why?</Link>
                      </Button>
                      {canRefine && (
                        <Menu>
                          <MenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Actions for ${r.candidate.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent className="w-56">
                            <MenuItem onSelect={() => setStatus(r.id, "SHORTLISTED")}>
                              <Check /> Shortlist
                            </MenuItem>
                            {canAsk && r.openQuestions > 0 && (
                              <MenuItem onSelect={() => ask(r.id)}>
                                <MessageCircleQuestion /> Ask{" "}
                                {r.openQuestions > 1 ? "top questions" : "1 question"}
                              </MenuItem>
                            )}
                            <MenuSeparator />
                            <MenuLabel>Reject because…</MenuLabel>
                            {REJECT_REASONS.map(([code, label]) => (
                              <MenuItem key={code} onSelect={() => setStatus(r.id, "REJECTED", code)}>
                                <ThumbsDown /> {label}
                              </MenuItem>
                            ))}
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </LayoutGroup>
        {rows.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 20)}
            className="w-full border-t border-line py-2.5 text-xs font-medium text-muted hover:bg-subtle hover:text-ink"
          >
            Show more ({rows.length - limit} remaining)
          </button>
        )}
        {rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">
            No ranked candidates yet. Activate the role or re-run matching.
          </div>
        )}
      </Panel>

      {filtered.length > 0 && (
        <Panel>
          <button
            onClick={() => setShowFiltered((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px]"
            aria-expanded={showFiltered}
          >
            <X className="size-4 text-bad" />
            <span className="font-medium text-ink">
              {filtered.length} candidates failed a hard constraint
            </span>
            <span className="text-muted">— kept out of the ranking, shown here for transparency</span>
            <ChevronDown
              className={cn("ml-auto size-4 text-muted transition", showFiltered && "rotate-180")}
            />
          </button>
          {showFiltered && (
            <ul className="divide-y divide-line border-t border-line">
              {filtered.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                  <Link
                    href={`/app/roles/${role.id}/matches/${r.id}`}
                    className="w-44 font-medium text-ink hover:text-accent"
                  >
                    {r.candidate.name}
                  </Link>
                  <span className="flex-1 text-muted">{r.failReasons.join(" ")}</span>
                  <span className="tabular text-xs text-faint">would score {Math.round(r.score * 200)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {canRefine && (
        <RefineDrawer
          open={refineOpen}
          onOpenChange={setRefineOpen}
          roleId={role.id}
          onApplied={(id) => setJobId(id)}
        />
      )}
    </div>
  );
}

function Funnel({ n, label, tone, tip }: { n: number; label: string; tone?: "bad"; tip?: string }) {
  const body = (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("tabular text-[15px] font-semibold", tone === "bad" ? "text-bad" : "text-ink")}>
        {n}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
  return tip ? <Tip content={tip}>{body}</Tip> : body;
}

function Arrow() {
  return <span className="hidden text-faint sm:inline">→</span>;
}
