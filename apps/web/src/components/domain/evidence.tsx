"use client";
import * as React from "react";
import {
  BadgeCheck,
  CircleAlert,
  FileText,
  FolderGit2,
  Link2,
  MessagesSquare,
  UserRound,
  Upload,
} from "lucide-react";
import type { Candidate, EvidenceNode } from "@trajectory/engine/client";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/panel";
import { cn, fmtDate, timeAgo } from "@/lib/utils";

interface Ctx {
  open: (id: string) => void;
  node: (id: string) => EvidenceNode | undefined;
}
const EvidenceCtx = React.createContext<Ctx | null>(null);

export const TYPE_META: Record<string, [React.ElementType, string]> = {
  EXPERIENCE: [FileText, "Experience"],
  RESUME_FRAGMENT: [FileText, "Resume excerpt"],
  PROJECT: [FileText, "Project"],
  REPOSITORY: [FolderGit2, "Repository"],
  COMMIT: [FolderGit2, "Commit"],
  ANSWER: [MessagesSquare, "Candidate answer"],
  PROFILE_FIELD: [UserRound, "Profile field"],
  OTHER: [Upload, "Other"],
};

export function EvidenceProvider({
  candidate,
  children,
  onOpen,
}: {
  candidate: Candidate;
  children: React.ReactNode;
  onOpen?: (id: string) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const byId = React.useMemo(() => new Map(candidate.evidence.map((n) => [n.id, n])), [candidate]);
  const ctx = React.useMemo<Ctx>(
    () => ({ open: (id) => (setOpenId(id), onOpen?.(id)), node: (id) => byId.get(id) }),
    [byId, onOpen],
  );
  const node = openId ? byId.get(openId) : undefined;
  return (
    <EvidenceCtx.Provider value={ctx}>
      {children}
      <Dialog open={!!node} onOpenChange={(v) => !v && setOpenId(null)}>
        {node && (
          <DialogContent
            side="right"
            title={node.title}
            description={`${TYPE_META[node.type]?.[1] ?? node.type} · ${node.sourceLocator ?? "no locator"}`}
          >
            <EvidenceDetail node={node} candidate={candidate} onNavigate={setOpenId} />
          </DialogContent>
        )}
      </Dialog>
    </EvidenceCtx.Provider>
  );
}

export function useEvidence() {
  const c = React.useContext(EvidenceCtx);
  if (!c) throw new Error("EvidenceProvider missing");
  return c;
}

export function EvidenceChips({
  ids,
  max = 3,
  className,
}: {
  ids: string[];
  max?: number;
  className?: string;
}) {
  const ev = useEvidence();
  const nodes = ids.map((id) => ev.node(id)).filter((n): n is EvidenceNode => !!n);
  if (!nodes.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {nodes.slice(0, max).map((n) => {
        const [Icon, label] = TYPE_META[n.type] ?? [FileText, n.type];
        return (
          <button
            key={n.id}
            onClick={() => ev.open(n.id)}
            className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2 transition hover:border-accent hover:text-accent"
            aria-label={`Open evidence: ${label} — ${n.title}`}
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{n.title}</span>
          </button>
        );
      })}
      {nodes.length > max && (
        <span className="self-center text-[11px] text-faint">+{nodes.length - max}</span>
      )}
    </span>
  );
}

function ageLabel(iso: string | null): string {
  if (!iso) return "undated";
  const years = (Date.now() - new Date(iso).getTime()) / 3.156e10;
  if (years < 0.25) return "current";
  return years < 1 ? `${Math.round(years * 12)} months old` : `${years.toFixed(1)} years old`;
}

export function EvidenceDetail({
  node,
  candidate,
  onNavigate,
}: {
  node: EvidenceNode;
  candidate: Candidate;
  onNavigate: (id: string) => void;
}) {
  const source = candidate.sources.find((s) => s.id === node.sourceId);
  const links = candidate.claimLinks.filter((l) => l.evidenceNodeId === node.id);
  const claims = links
    .map((l) => ({ link: l, claim: candidate.claims.find((c) => c.id === l.claimId)! }))
    .filter((x) => x.claim);
  const conflicts = claims
    .filter((x) => x.claim.status === "CONFLICTED")
    .flatMap((x) =>
      candidate.claimLinks.filter((l) => l.claimId === x.claim.id && l.evidenceNodeId !== node.id),
    )
    .map((l) => candidate.evidence.find((n) => n.id === l.evidenceNodeId))
    .filter((n): n is EvidenceNode => !!n);

  let excerpt: React.ReactNode = (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{node.body}</p>
  );
  if (source?.text && node.startOffset !== null && node.endOffset !== null) {
    const a = Math.max(0, node.startOffset - 220);
    const b = Math.min(source.text.length, node.endOffset + 220);
    excerpt = (
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel-2 p-3 font-sans text-[12.5px] leading-relaxed text-muted">
        {a > 0 && "…"}
        {source.text.slice(a, node.startOffset)}
        <mark className="evidence text-ink">{source.text.slice(node.startOffset, node.endOffset)}</mark>
        {source.text.slice(node.endOffset, b)}
        {b < source.text.length && "…"}
      </pre>
    );
  }
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={node.verified ? "good" : "unknown"}>
          {node.verified ? <BadgeCheck className="size-3" /> : <CircleAlert className="size-3" />}
          {node.verified ? "Verified" : "Not externally verified"}
        </Badge>
        <Badge tone="outline">Confidence {Math.round(node.confidence * 100)}%</Badge>
        <Badge tone="outline">{ageLabel(node.observedAt)}</Badge>
        {source && <Badge tone="outline">Source: {source.sourceType.toLowerCase()}</Badge>}
        {node.tags
          .filter((t) => !["self_listed"].includes(t))
          .map((t) => (
            <Badge key={t} tone="accent">
              {t.replace("_", " ")}
            </Badge>
          ))}
      </div>
      <div>
        <SectionLabel className="mb-2">
          Source excerpt{node.startOffset !== null ? ` · chars ${node.startOffset}–${node.endOffset}` : ""}
        </SectionLabel>
        {excerpt}
        {node.type === "REPOSITORY" && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            <span>★ {String(node.metadata.stars ?? 0)}</span>
            <span>{String(node.metadata.language ?? "")}</span>
            <span className="flex items-center gap-1">
              <Link2 className="size-3" />
              {String(node.metadata.url ?? "")}
            </span>
            <span>
              last commit {fmtDate(node.observedAt, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        )}
      </div>
      {node.skills.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Skills evidenced</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {node.skills.map((s) => (
              <Badge key={s} tone="neutral">
                {candidate.skills.find((k) => k.skillKey === s)?.displayName ?? s}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <SectionLabel className="mb-2">
          Claims this evidence {claims.length ? "supports" : "is linked to"}
        </SectionLabel>
        {claims.length ? (
          <ul className="space-y-1.5">
            {claims.map(({ link, claim }) => (
              <li key={claim.id + link.relation} className="flex items-center gap-2 text-[13px]">
                <Badge
                  tone={
                    link.relation === "CONTRADICTS"
                      ? "bad"
                      : link.relation === "SUPPORTS"
                        ? "good"
                        : "outline"
                  }
                >
                  {link.relation.toLowerCase()}
                </Badge>
                <span className="flex-1 text-ink-2">{claim.claimValue}</span>
                <Badge
                  tone={
                    claim.status === "SUPPORTED"
                      ? "good"
                      : claim.status === "CONFLICTED"
                        ? "bad"
                        : claim.status === "PARTIAL"
                          ? "warn"
                          : "unknown"
                  }
                >
                  {claim.status.toLowerCase()}
                </Badge>
                <span className="tabular text-[11px] text-faint">
                  strength {Math.round(link.strength * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No claims link to this node.</p>
        )}
      </div>
      {conflicts.length > 0 && (
        <div className="rounded-lg border border-bad/30 bg-bad-soft p-3">
          <SectionLabel className="mb-2 text-bad">
            Conflicting evidence — surfaced, not silently resolved
          </SectionLabel>
          {conflicts.map((n) => (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              className="block text-left text-[13px] text-bad underline-offset-2 hover:underline"
            >
              {n.title}: {n.body.slice(0, 120)}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-faint">
        Ingested {timeAgo(node.createdAt)} · claims never overwrite the original source.
      </p>
    </div>
  );
}
