"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileSearch,
  Gauge,
  History,
  Lock,
  MessageCircleQuestion,
  MessagesSquare,
  Route,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  Workflow,
} from "lucide-react";
import type {
  AuditEvent,
  Candidate,
  Conversation,
  Introduction,
  JobRole,
  Match,
  RankingFeedback,
  RoleRequirement,
} from "@trajectory/engine/client";
import type { Trajectory } from "@trajectory/engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Textarea } from "@/components/ui/input";
import { ConfidenceMeter, ConstraintBadge, MatchStatusBadge, ScoreRing } from "@/components/domain/score";
import { EvidenceChips, EvidenceProvider } from "@/components/domain/evidence";
import { EvidenceGraph } from "@/components/domain/evidence-graph";
import { WhyNotHundred } from "@/components/domain/why-not";
import { ScoreBreakdown } from "@/components/domain/breakdown";
import { TrajectoryArc } from "@/components/domain/trajectory-arc";
import { requestIntroAction, setMatchStatusAction, startQualificationAction } from "@/app/actions/matches";
import { cn, fmtDate, money, timeAgo } from "@/lib/utils";

export interface MatchDetailProps {
  match: Match;
  candidate: Candidate;
  role: JobRole;
  requirements: RoleRequirement[];
  trajectory: Trajectory;
  conversation: Conversation | null;
  intro: Introduction | null;
  feedback: RankingFeedback[];
  activity: (AuditEvent & { actor: string })[];
  prevId: string | null;
  nextId: string | null;
  caps: string[];
  blend: { deterministic: number; semantic: number; rerank: number };
}

export function MatchDetail(p: MatchDetailProps) {
  const { match: m, candidate: c, role } = p;
  const router = useRouter();
  const [introOpen, setIntroOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const e = m.explanation;
  const canRefine = p.caps.includes("ranking.refine");
  const canAsk = p.caps.includes("intro.request");

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(ev.target.tagName)) return;
      if (ev.key === "j" && p.nextId) router.push(`/app/roles/${role.id}/matches/${p.nextId}`);
      if (ev.key === "k" && p.prevId) router.push(`/app/roles/${role.id}/matches/${p.prevId}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.nextId, p.prevId, role.id, router]);

  const ask = async (keys?: string[]) => {
    setBusy(true);
    const r = await startQualificationAction(m.id, keys);
    setBusy(false);
    if (!r.ok) return toast.error(r.error.message);
    toast.success(`${r.data.sent} question${r.data.sent === 1 ? "" : "s"} sent`, {
      description: "The candidate answers in their portal — nothing else is sent.",
      action: { label: "Open portal", onClick: () => window.open(r.data.link, "_blank") },
    });
    router.refresh();
  };

  const status = async (s: "SHORTLISTED" | "REJECTED", reason: string | null = null) => {
    const r = await setMatchStatusAction(m.id, s, reason);
    if (!r.ok) return toast.error(r.error.message);
    toast.success(s === "SHORTLISTED" ? "Shortlisted" : "Rejected — reason recorded as ranking feedback");
    router.refresh();
  };

  const requestIntro = async () => {
    setBusy(true);
    const r = await requestIntroAction(m.id, note || null);
    setBusy(false);
    if (!r.ok) return toast.error(r.error.message);
    setIntroOpen(false);
    toast.success("Intro drafted — next: ask the candidate for consent", {
      action: { label: "Open intros", onClick: () => router.push("/app/intros") },
    });
    router.refresh();
  };

  const openQs = m.uncertainties
    .filter((u) => !u.resolvedAt && u.resolutionQuestion)
    .sort((a, b) => b.expectedImpact - a.expectedImpact);
  const asked = new Set(
    p.conversation?.messages
      .filter((x) => x.structured?.kind === "question")
      .map((x) => x.structured!.uncertaintyKey) ?? [],
  );

  return (
    <EvidenceProvider candidate={c}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
          <Link href="/app/roles" className="hover:text-ink">
            Roles
          </Link>
          <ChevronRight className="size-3 text-faint" />
          <Link href={`/app/roles/${role.id}/matches`} className="hover:text-ink">
            {role.title}
          </Link>
          <ChevronRight className="size-3 text-faint" />
          <span className="text-ink-2">{c.fullName}</span>
        </nav>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!p.prevId}
            onClick={() => p.prevId && router.push(`/app/roles/${role.id}/matches/${p.prevId}`)}
            aria-label="Previous match (k)"
          >
            <ChevronLeft /> Prev <span className="text-faint">k</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!p.nextId}
            onClick={() => p.nextId && router.push(`/app/roles/${role.id}/matches/${p.nextId}`)}
            aria-label="Next match (j)"
          >
            Next <span className="text-faint">j</span> <ChevronRight />
          </Button>
        </div>
      </div>

      {/* hero */}
      <Panel className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-5">
          <ScoreRing value={m.finalScore} size={84} stroke={6} label="Mutual fit" />
          <div className="min-w-[260px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">{c.fullName}</h1>
              {m.rank > 0 ? (
                <Badge tone="neutral">#{m.rank} of ranked</Badge>
              ) : (
                <Badge tone="bad">filtered: fails a hard constraint</Badge>
              )}
              <MatchStatusBadge status={m.status} />
              {c.synthetic && <Badge tone="outline">synthetic profile</Badge>}
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {c.headline} · {[c.city, c.region].filter(Boolean).join(", ")} · {c.yearsExperience} yrs
            </p>
            {e && <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-2">{e.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ConfidenceMeter value={m.confidenceScore} />
              <ConstraintBadge status={m.hardConstraintStatus} />
              <span className="text-[11px] text-faint">
                {m.scoreVersion} · {e?.promptVersion} · generated {timeAgo(m.updatedAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRefine && m.status !== "SHORTLISTED" && (
              <Button onClick={() => status("SHORTLISTED")}>
                <Check /> Shortlist
              </Button>
            )}
            {canAsk && openQs.length > 0 && (
              <Button onClick={() => ask()} disabled={busy}>
                <MessageCircleQuestion /> Ask {Math.min(2, openQs.length)} question
                {openQs.length > 1 ? "s" : ""}
              </Button>
            )}
            {canAsk && !p.intro && m.hardConstraintStatus !== "FAIL" && (
              <Button variant="primary" onClick={() => setIntroOpen(true)}>
                <Workflow /> Request intro
              </Button>
            )}
            {p.intro && (
              <Button asChild>
                <Link href="/app/intros">
                  Intro: {p.intro.status.toLowerCase().replace(/_/g, " ")} <ArrowRight />
                </Link>
              </Button>
            )}
            {canRefine && m.status !== "REJECTED" && (
              <Button variant="ghost" onClick={() => status("REJECTED", "manual")} aria-label="Reject">
                <ThumbsDown />
              </Button>
            )}
          </div>
        </div>
        {c.flags.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line bg-panel-2 px-5 py-2.5">
            {c.flags.map((f, i) => (
              <span
                key={i}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  f.kind === "PROMPT_INJECTION"
                    ? "text-warn"
                    : f.kind === "CONFLICT"
                      ? "text-bad"
                      : "text-muted",
                )}
              >
                <ShieldAlert className="size-3.5" />
                {f.kind === "PROMPT_INJECTION"
                  ? "Prompt-injection text in source (ignored)"
                  : f.kind === "PROTECTED_ATTRIBUTE"
                    ? "Protected attribute in source (excluded from features)"
                    : "Conflicting sources"}
                : {f.detail}
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Tabs defaultValue="summary">
        <TabsList className="mb-5 overflow-x-auto">
          <TabsTrigger value="summary">
            <Sparkles /> Summary
          </TabsTrigger>
          <TabsTrigger value="evidence">
            <FileSearch /> Evidence
          </TabsTrigger>
          <TabsTrigger value="score">
            <Gauge /> Score breakdown
          </TabsTrigger>
          <TabsTrigger value="conversation">
            <MessagesSquare /> Conversation {p.conversation ? `· ${p.conversation.messages.length}` : ""}
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="outline-none">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
            <div className="space-y-6">
              <Panel>
                <PanelHeader
                  title="Why this match?"
                  description="Every claim cites evidence from the candidate's sources — click to inspect."
                />
                <ul className="divide-y divide-line">
                  {(e?.whyMatch ?? []).map((w, i) => (
                    <li key={i} className="flex gap-3 px-4 py-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-good" />
                      <div className="min-w-0">
                        <p className="text-[13px] leading-relaxed text-ink">{w.text}</p>
                        <EvidenceChips ids={w.evidenceIds} className="mt-1.5" />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel>
                <PanelHeader
                  title="Why not 100?"
                  description="Computed from score gaps — the explanation layer cannot change these numbers."
                />
                <div className="p-4">
                  {e && <WhyNotHundred items={e.whyNotHundred} score={m.finalScore} />}
                </div>
              </Panel>
              <Panel>
                <PanelHeader
                  icon={<Route className="size-3.5 text-muted" />}
                  title="Career trajectory"
                  description="Where this person is heading, not just where they've been."
                />
                <div className="p-4">
                  <TrajectoryArc t={p.trajectory} />
                </div>
              </Panel>
            </div>
            <div className="space-y-6">
              <Panel>
                <PanelHeader
                  title="What would change the score?"
                  description="Deterministic re-scoring with each unknown resolved favourably."
                />
                <ul className="divide-y divide-line">
                  {(e?.counterfactuals ?? []).slice(0, 5).map((cf) => {
                    const delta = cf.finalAfter - cf.finalBefore;
                    const u = m.uncertainties.find((x) => x.key === cf.key);
                    return (
                      <li key={cf.key} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13px] font-medium text-ink">{cf.scenario}</p>
                          <span className="tabular shrink-0 text-[13px] font-semibold text-good">
                            {cf.finalBefore.toFixed(1)} → {cf.finalAfter.toFixed(1)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {cf.componentDeltas.map((d) => (
                            <Badge key={d.key} tone={d.delta > 0 ? "good" : "bad"}>
                              {d.label} {d.delta > 0 ? "+" : ""}
                              {d.delta.toFixed(2)}
                            </Badge>
                          ))}
                          {cf.confidenceDelta !== 0 && (
                            <Badge tone="info">
                              confidence {cf.confidenceDelta > 0 ? "+" : ""}
                              {cf.confidenceDelta.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                        {u?.resolutionQuestion && canAsk && delta > 0 && (
                          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-panel-2 px-2.5 py-1.5">
                            <span className="text-xs text-muted">“{u.resolutionQuestion}”</span>
                            {asked.has(u.key) ? (
                              <Badge tone="info">asked</Badge>
                            ) : (
                              <Button size="sm" onClick={() => ask([u.key])} disabled={busy}>
                                Ask
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {(e?.counterfactuals.length ?? 0) === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-muted">
                      No open unknowns — the profile is fully evidenced for this role.
                    </li>
                  )}
                </ul>
              </Panel>
              <Panel>
                <PanelHeader
                  icon={<Lock className="size-3.5 text-muted" />}
                  title="Hard constraints"
                  description="PASS / FAIL / UNKNOWN — never delegated to a model."
                />
                <ul className="divide-y divide-line">
                  {m.constraints.map((k) => (
                    <li key={k.key + k.label} className="flex items-start gap-3 px-4 py-2.5">
                      <ConstraintBadge status={k.status} className="mt-0.5 w-[68px] justify-center" short />
                      <div className="min-w-0 text-[13px]">
                        <div className="font-medium text-ink">
                          {k.label}{" "}
                          {k.soft && <span className="text-[11px] font-normal text-faint">(soft)</span>}
                        </div>
                        <div className="text-xs text-muted">{k.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel>
                <PanelHeader
                  icon={<CircleHelp className="size-3.5 text-muted" />}
                  title="Risks & unknowns"
                  description="Missing evidence is not negative evidence."
                />
                <ul className="divide-y divide-line">
                  {(e?.risks ?? []).map((r, i) => (
                    <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                      <Badge
                        tone={r.kind === "negative" ? "bad" : r.kind === "conflict" ? "warn" : "unknown"}
                      >
                        {r.kind}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-ink-2">{r.text}</p>
                        <EvidenceChips ids={r.evidenceIds} className="mt-1" />
                      </div>
                    </li>
                  ))}
                  {(e?.risks.length ?? 0) === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-muted">No notable risks.</li>
                  )}
                </ul>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="outline-none">
          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <Panel>
              <PanelHeader
                title="Evidence graph"
                description="Claims (left) linked to the evidence that supports or contradicts them. Click an evidence node to open its source."
              />
              <div className="p-3">
                <EvidenceGraph
                  candidate={c}
                  focusSkills={p.requirements
                    .filter((r) => r.category === "SKILL")
                    .map((r) => r.normalizedKey)}
                />
              </div>
              <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
                <Legend color="var(--good)" label="supported (≥2 sources)" />
                <Legend color="var(--warn)" label="partial (1 source)" />
                <Legend color="var(--unknown)" label="self-listed only" />
                <Legend color="var(--bad)" label="conflicted" />
              </div>
            </Panel>
            <div className="space-y-6">
              <Panel>
                <PanelHeader
                  title="Claims"
                  description={`${c.claims.length} claims from ${c.sources.length} sources`}
                />
                <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
                  {[...c.claims]
                    .sort(
                      (a, b) =>
                        ["CONFLICTED", "SUPPORTED", "PARTIAL", "UNSUPPORTED"].indexOf(a.status) -
                        ["CONFLICTED", "SUPPORTED", "PARTIAL", "UNSUPPORTED"].indexOf(b.status),
                    )
                    .map((cl) => (
                      <li key={cl.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 text-[13px]">
                          <span className="flex-1 font-medium text-ink">{cl.claimValue}</span>
                          {cl.inferred && <Badge tone="outline">inferred</Badge>}
                          <Badge
                            tone={
                              cl.status === "SUPPORTED"
                                ? "good"
                                : cl.status === "CONFLICTED"
                                  ? "bad"
                                  : cl.status === "PARTIAL"
                                    ? "warn"
                                    : "unknown"
                            }
                          >
                            {cl.status.toLowerCase()}
                          </Badge>
                        </div>
                        <EvidenceChips
                          ids={c.claimLinks.filter((l) => l.claimId === cl.id).map((l) => l.evidenceNodeId)}
                          max={4}
                          className="mt-1"
                        />
                      </li>
                    ))}
                </ul>
              </Panel>
              <Panel>
                <PanelHeader title="Sources" />
                <ul className="divide-y divide-line text-[13px]">
                  {c.sources.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-4 py-2.5">
                      <Badge tone="neutral">{s.sourceType.toLowerCase()}</Badge>
                      <span className="flex-1 truncate text-ink-2">
                        {s.originalFilename ?? s.sourceUri ?? String(s.metadata.adapter ?? "")}
                      </span>
                      <span className="text-[11px] text-faint">{timeAgo(s.ingestedAt)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Link
                href={`/app/candidates/${c.id}`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Full candidate profile <ExternalLink className="size-3" />
              </Link>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="score" className="outline-none">
          <Panel className="p-4">
            <ScoreBreakdown
              components={m.components}
              blend={p.blend}
              det={m.deterministicScore}
              sem={m.semanticScore}
              rerank={m.rerankScore}
              final={m.finalScore}
              rawRerank={m.rerank?.rawRelevance ?? null}
              probs={m.rerank?.probabilities ?? null}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="conversation" className="outline-none">
          <Panel>
            <PanelHeader
              title="Qualification conversation"
              description="Questions are chosen by expected score impact. Answers update evidence with source = conversation."
              actions={
                p.conversation && (
                  <Button size="sm" asChild>
                    <a href={`/candidate/${p.conversation.portalToken}`} target="_blank" rel="noreferrer">
                      Open candidate portal <ExternalLink />
                    </a>
                  </Button>
                )
              }
            />
            {p.conversation ? (
              <ol className="space-y-3 p-4">
                {p.conversation.messages.map((msg) => (
                  <li
                    key={msg.id}
                    className={cn("flex", msg.senderType === "CANDIDATE" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-[13px]",
                        msg.senderType === "CANDIDATE"
                          ? "bg-ink text-bg"
                          : msg.structured?.kind === "score_update"
                            ? "border border-good/30 bg-good-soft text-good"
                            : msg.senderType === "SYSTEM"
                              ? "bg-subtle text-muted"
                              : "border border-line bg-panel text-ink",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-60">
                        {msg.senderType === "AGENT" ? "Qualification agent" : msg.senderType.toLowerCase()} ·{" "}
                        {timeAgo(msg.createdAt)}
                      </div>
                      {msg.content}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="p-8 text-center text-[13px] text-muted">
                No conversation yet.
                {canAsk && openQs.length > 0 && (
                  <div className="mt-3">
                    <Button onClick={() => ask()} disabled={busy}>
                      <MessageCircleQuestion /> Ask the {Math.min(2, openQs.length)} highest-value question
                      {openQs.length > 1 ? "s" : ""}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="activity" className="outline-none">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Audit trail" />
              <ul className="divide-y divide-line">
                {p.activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <span className="font-medium text-ink">{a.actor}</span>{" "}
                    <span className="text-muted">{a.action.replace(/[._]/g, " ")}</span>
                    <div className="text-[11px] text-faint">{timeAgo(a.createdAt)}</div>
                  </li>
                ))}
                {p.activity.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted">No activity yet.</li>
                )}
              </ul>
            </Panel>
            <Panel>
              <PanelHeader title="Feedback & intro history" />
              <ul className="divide-y divide-line">
                {p.feedback.map((f) => (
                  <li key={f.id} className="px-4 py-2.5 text-[13px]">
                    <Badge tone={f.type === "REJECT" ? "bad" : "accent"}>{f.type.toLowerCase()}</Badge>{" "}
                    {f.reasonCode && (
                      <span className="text-muted">reason: {f.reasonCode.replace("_", " ")}</span>
                    )}
                    <div className="text-[11px] text-faint">{timeAgo(f.createdAt)}</div>
                  </li>
                ))}
                {p.intro?.history.map((h, i) => (
                  <li key={i} className="px-4 py-2.5 text-[13px]">
                    <Badge tone="warn">intro → {h.status.toLowerCase().replace(/_/g, " ")}</Badge>{" "}
                    {h.note && <span className="text-muted">{h.note}</span>}
                    <div className="text-[11px] text-faint">
                      {fmtDate(h.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </li>
                ))}
                {p.feedback.length === 0 && !p.intro && (
                  <li className="px-4 py-6 text-center text-xs text-muted">Nothing yet.</li>
                )}
              </ul>
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={introOpen} onOpenChange={setIntroOpen}>
        <DialogContent
          title={`Request an intro to ${c.fullName}`}
          description="Creates a draft. The candidate must consent and a recruiter must approve before anything is sent."
        >
          <div className="space-y-4 p-5">
            <div className="rounded-lg bg-panel-2 p-3 text-xs text-muted">
              <div className="mb-1 font-medium text-ink-2">Human-in-the-loop path</div>
              Draft → candidate consent (portal) → ready for approval → recruiter approves → marked sent. No
              automatic outreach.
            </div>
            <Textarea
              rows={3}
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="Internal note for the team (optional)"
              aria-label="Recruiter note"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIntroOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={requestIntro} disabled={busy}>
                Create intro draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mt-8 flex justify-between text-xs text-muted">
        <Link
          href={`/app/roles/${role.id}/matches`}
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          <ArrowLeft className="size-3" /> Back to ranking
        </Link>
        <span>
          Role comp {money(role.minComp)}–{money(role.maxComp)} · candidate expects {money(c.salaryMin)}
        </span>
      </div>
    </EvidenceProvider>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2.5 rounded-sm border-[1.5px]" style={{ borderColor: color }} />
      {label}
    </span>
  );
}
