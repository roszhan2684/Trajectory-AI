"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderGit2, ShieldAlert, Trash2 } from "lucide-react";
import type { Candidate, Conversation, JobRole, Match, SearchIndexState } from "@trajectory/engine/client";
import { Panel, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { EvidenceChips, EvidenceProvider, useEvidence } from "@/components/domain/evidence";
import { EvidenceGraph } from "@/components/domain/evidence-graph";
import { MiniBar, ScoreRing } from "@/components/domain/score";
import { deleteCandidateAction, importGithubAction } from "@/app/actions/candidates";
import { fmtDate, money, timeAgo } from "@/lib/utils";

interface Props {
  candidate: Candidate;
  matches: { match: Match; role: JobRole }[];
  indexState: SearchIndexState | null;
  conversations: Conversation[];
  canIngest: boolean;
  canDelete: boolean;
}

export function CandidateProfile(p: Props) {
  return (
    <EvidenceProvider candidate={p.candidate}>
      <Inner {...p} />
    </EvidenceProvider>
  );
}

function Inner({ candidate: c, matches, indexState, canIngest, canDelete }: Props) {
  const router = useRouter();
  const [ghOpen, setGhOpen] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const resume = c.sources.find((s) => s.sourceType === "RESUME" && s.text);
  const prefs = c.preferences;
  const exps = [...c.experiences].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const nodeFor = (expId: string) =>
    c.evidence
      .filter((n) => n.metadata.experienceId === expId && n.type === "RESUME_FRAGMENT")
      .map((n) => n.id);

  const importGh = async () => {
    const r = await importGithubAction(c.id, handle.trim());
    if (!r.ok) return toast.error(r.error.message);
    toast.success("Synthetic GitHub metadata linked — claims re-derived and re-indexed");
    setGhOpen(false);
    router.refresh();
  };
  const del = async () => {
    if (
      !confirm(
        `Delete ${c.fullName} and all derived data (matches, conversations, index document)? This is the PII deletion pathway.`,
      )
    )
      return;
    const r = await deleteCandidateAction(c.id);
    if (!r.ok) return toast.error(r.error.message);
    toast.success("Candidate data deleted");
    router.push("/app/candidates");
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {c.synthetic && <Badge tone="outline">synthetic profile</Badge>}
            <Badge tone={indexState?.status === "INDEXED" ? "good" : "warn"}>
              index: {indexState?.status.toLowerCase() ?? "missing"}
            </Badge>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{c.fullName}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {c.headline} · {[c.city, c.region, c.countryCode].filter(Boolean).join(", ")} ·{" "}
            {c.yearsExperience} yrs
          </p>
        </div>
        <div className="flex gap-2">
          {canIngest && !c.sources.some((s) => s.sourceType === "GITHUB") && (
            <Button onClick={() => setGhOpen(true)}>
              <FolderGit2 /> Link GitHub (demo)
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={del} aria-label="Delete candidate data">
              <Trash2 /> Delete data
            </Button>
          )}
        </div>
      </div>
      {c.flags.length > 0 && (
        <div className="mb-6 space-y-1.5 rounded-xl border border-warn/30 bg-warn-soft p-3">
          {c.flags.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-warn">
              <ShieldAlert className="mt-px size-3.5 shrink-0" />
              <span>
                <b>
                  {f.kind === "PROMPT_INJECTION"
                    ? "Prompt injection detected & ignored"
                    : f.kind === "PROTECTED_ATTRIBUTE"
                      ? "Protected attribute — excluded from matching"
                      : "Conflicting sources"}
                  :
                </b>{" "}
                {f.detail}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title="Experience"
              description="Each bullet is an evidence node with exact source offsets."
            />
            <ol className="divide-y divide-line">
              {exps.map((e) => (
                <li key={e.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[14px] font-medium text-ink">
                      {e.title} <span className="font-normal text-muted">· {e.company}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.companyStage && <Badge tone="neutral">{e.companyStage}</Badge>}
                    {e.teamSize && <Badge tone="outline">{e.teamSize.toLocaleString()} people</Badge>}
                    {e.normalizedSkills.slice(0, 6).map((s) => (
                      <Badge key={s} tone="outline">
                        {c.skills.find((k) => k.skillKey === s)?.displayName ?? s}
                      </Badge>
                    ))}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {e.bullets.map((b, i) => (
                      <li key={i} className="text-[13px] leading-relaxed text-ink-2">
                        – {b}
                      </li>
                    ))}
                  </ul>
                  <EvidenceChips ids={nodeFor(e.id)} max={4} className="mt-2" />
                </li>
              ))}
            </ol>
          </Panel>
          {resume?.text && (
            <Panel>
              <PanelHeader
                title="Source document"
                description={`${resume.originalFilename ?? "resume"} · checksum ${resume.checksum} · highlighted spans are evidence`}
              />
              <ResumeView text={resume.text} candidate={c} />
            </Panel>
          )}
          <Panel>
            <PanelHeader
              title="Evidence graph"
              description="All claims and their supporting / contradicting evidence."
            />
            <div className="p-3">
              <EvidenceGraph candidate={c} />
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel>
            <PanelHeader title={`Matches in your organization · ${matches.length}`} />
            <ul className="divide-y divide-line">
              {matches.map(({ match: m, role }) => (
                <li key={m.id}>
                  <Link
                    href={`/app/roles/${role.id}/matches/${m.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2"
                  >
                    <ScoreRing value={m.finalScore} size={34} stroke={3} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{role.title}</span>
                      <span className="text-[11px] text-muted">
                        {m.rank > 0 ? `#${m.rank}` : "filtered"} · {m.status.toLowerCase().replace("_", " ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">
                  Not retrieved for any of your roles yet.
                </li>
              )}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Profile completeness" description="Drives confidence — not fit." />
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <MiniBar value={c.profileCompleteness} tone="accent" />
                <span className="tabular text-sm font-semibold text-ink">
                  {Math.round(c.profileCompleteness * 100)}%
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <Fact k="Work authorization" v={c.workAuthorization?.replace("_", " ")} />
                <Fact k="Salary expectation" v={c.salaryMin ? `${money(c.salaryMin)}+` : null} />
                <Fact k="Availability" v={c.availability?.replace("_", " ")} />
                <Fact k="Work modes" v={prefs.workModes?.join(", ")} />
                <Fact
                  k="Open to relocate"
                  v={prefs.openToRelocate === null ? null : prefs.openToRelocate ? "yes" : "no"}
                />
                <Fact k="Desired stages" v={prefs.desiredStages?.join(", ")} />
                <Fact
                  k="Team size"
                  v={
                    prefs.maxTeamSize
                      ? `≤ ${prefs.maxTeamSize}`
                      : prefs.minTeamSize
                        ? `≥ ${prefs.minTeamSize}`
                        : null
                  }
                />
                <Fact
                  k="Wants AI work"
                  v={prefs.wantsAiWork === null ? null : prefs.wantsAiWork ? "yes" : "no"}
                />
              </dl>
            </div>
          </Panel>
          <Panel>
            <PanelHeader
              title="Skill claims"
              description="Supported = ≥ 2 independent evidence nodes. Self-listed only = unsupported."
            />
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {c.claims
                .filter((cl) => cl.claimType === "skill")
                .sort(
                  (a, b) =>
                    ["SUPPORTED", "PARTIAL", "CONFLICTED", "UNSUPPORTED"].indexOf(a.status) -
                    ["SUPPORTED", "PARTIAL", "CONFLICTED", "UNSUPPORTED"].indexOf(b.status),
                )
                .map((cl) => {
                  const sk = c.skills.find((s) => s.skillKey === cl.claimKey);
                  return (
                    <li key={cl.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                      <span className="flex-1 text-ink">{cl.claimValue}</span>
                      {sk?.lastUsedAt && (
                        <span className="text-[11px] text-faint">last used {fmtDate(sk.lastUsedAt)}</span>
                      )}
                      <Badge
                        tone={
                          cl.status === "SUPPORTED"
                            ? "good"
                            : cl.status === "PARTIAL"
                              ? "warn"
                              : cl.status === "CONFLICTED"
                                ? "bad"
                                : "unknown"
                        }
                      >
                        {cl.status === "UNSUPPORTED" ? "self-listed" : cl.status.toLowerCase()}
                      </Badge>
                    </li>
                  );
                })}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Sources" />
            <ul className="divide-y divide-line text-[13px]">
              {c.sources.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{s.sourceType.toLowerCase()}</Badge>
                    <span className="flex-1 truncate text-ink-2">
                      {s.originalFilename ?? s.sourceUri ?? "—"}
                    </span>
                    <span className="text-[11px] text-faint">{timeAgo(s.ingestedAt)}</span>
                  </div>
                  {"adapter" in s.metadata && (
                    <div className="mt-1 text-[11px] text-muted">adapter: {String(s.metadata.adapter)}</div>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <Dialog open={ghOpen} onOpenChange={setGhOpen}>
        <DialogContent
          title="Link GitHub (demo adapter)"
          description="Generates deterministic synthetic repository metadata shaped like the GitHub API. Swap the adapter for GitHub OAuth in production."
        >
          <div className="space-y-3 p-5">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="github username"
              aria-label="GitHub username"
            />
            <div className="flex justify-end">
              <Button variant="primary" onClick={importGh} disabled={!handle.trim()}>
                Import metadata
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className={v ? "text-ink" : "text-faint italic"}>{v ?? "unknown"}</dd>
    </>
  );
}

function ResumeView({ text, candidate }: { text: string; candidate: Candidate }) {
  const ev = useEvidence();
  const spans = candidate.evidence
    .filter(
      (n) =>
        n.startOffset !== null &&
        n.endOffset !== null &&
        (n.type === "RESUME_FRAGMENT" || n.type === "PROJECT") &&
        !n.tags.includes("self_listed"),
    )
    .sort((a, b) => a.startOffset! - b.startOffset!);
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const n of spans) {
    if (n.startOffset! < i) continue;
    out.push(text.slice(i, n.startOffset!));
    out.push(
      <button key={n.id} onClick={() => ev.open(n.id)} className="evidence-btn rounded-sm text-left">
        <mark className="evidence">{text.slice(n.startOffset!, n.endOffset!)}</mark>
      </button>,
    );
    i = n.endOffset!;
  }
  out.push(text.slice(i));
  return (
    <div className="max-h-[560px] overflow-auto p-4">
      <SectionLabel className="mb-2">
        Untrusted source data — rendered as text, never as instructions
      </SectionLabel>
      <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">{out}</pre>
    </div>
  );
}
