"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock, ExternalLink, Send, ShieldCheck, UserCheck, X } from "lucide-react";
import type { IntroStatus, Introduction } from "@trajectory/engine/client";
import { INTRO_LABELS } from "@trajectory/engine/client";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { ScoreRing } from "@/components/domain/score";
import { introTransitionAction, updateIntroDraftAction } from "@/app/actions/matches";
import { cn, timeAgo } from "@/lib/utils";

export interface IntroCard {
  intro: Introduction;
  candidate: { id: string; name: string; headline: string };
  role: { id: string; title: string };
  matchId: string | null;
  score: number | null;
  requestedBy: string | null;
  approvedBy: string | null;
  portal: string | null;
  canApprove: boolean;
}

const COLUMNS: { title: string; statuses: IntroStatus[]; hint: string }[] = [
  { title: "Draft", statuses: ["DRAFT"], hint: "Recruiter requested" },
  { title: "Awaiting candidate", statuses: ["AWAITING_CANDIDATE"], hint: "Consent asked in portal" },
  { title: "Ready for approval", statuses: ["READY_FOR_APPROVAL"], hint: "Candidate consented" },
  { title: "Approved", statuses: ["APPROVED"], hint: "Ready to send" },
  { title: "Sent", statuses: ["SENT"], hint: "Recorded" },
  { title: "Closed", statuses: ["DECLINED", "CANCELLED"], hint: "Declined or cancelled" },
];

export function IntroBoard({
  cards,
  messagingConfigured,
}: {
  cards: IntroCard[];
  messagingConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<IntroCard | null>(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const op = async (c: IntroCard, o: "consent" | "approve" | "send" | "cancel") => {
    setBusy(true);
    const r = await introTransitionAction(
      c.intro.id,
      o,
      o === "cancel" ? "Cancelled by recruiter" : undefined,
    );
    setBusy(false);
    if (!r.ok) return toast.error(r.error.message);
    if (o === "consent" && r.data.link)
      toast.success("Consent requested in the candidate portal", {
        action: { label: "Open portal", onClick: () => window.open(r.data.link!, "_blank") },
      });
    else
      toast.success(
        o === "approve"
          ? "Approved"
          : o === "send"
            ? "Recorded as sent"
            : o === "cancel"
              ? "Cancelled"
              : "Updated",
      );
    setOpen(null);
    router.refresh();
  };

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const items = cards.filter((c) => col.statuses.includes(c.intro.status));
          return (
            <section
              key={col.title}
              aria-label={col.title}
              className="flex min-h-40 flex-col rounded-xl border border-line bg-panel-2"
            >
              <header className="flex items-center justify-between px-3 pb-2 pt-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">{col.title}</h2>
                  <p className="text-[11px] text-faint">{col.hint}</p>
                </div>
                <span className="tabular rounded-md bg-panel px-1.5 text-xs text-muted">{items.length}</span>
              </header>
              <ul className="flex-1 space-y-2 px-2 pb-2">
                {items.map((c) => (
                  <li key={c.intro.id}>
                    <button
                      onClick={() => {
                        setOpen(c);
                        setDraft(c.intro.draft ?? "");
                      }}
                      className="w-full rounded-lg border border-line bg-panel p-2.5 text-left shadow-panel transition hover:border-line-strong"
                    >
                      <div className="flex items-start gap-2">
                        {c.score !== null && <ScoreRing value={c.score} size={28} stroke={3} />}
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-ink">{c.candidate.name}</div>
                          <div className="truncate text-[11px] text-muted">{c.role.title}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
                        <span>{timeAgo(c.intro.updatedAt)}</span>
                        {c.intro.status === "READY_FOR_APPROVAL" && <Badge tone="warn">needs approval</Badge>}
                        {c.intro.status === "DECLINED" && <Badge tone="bad">declined</Badge>}
                        {c.intro.status === "CANCELLED" && <Badge tone="outline">cancelled</Badge>}
                        {c.intro.status === "SENT" && (
                          <Badge tone="good">
                            {c.intro.deliveryChannel === "demo_internal" ? "sent (demo)" : "sent"}
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="px-2 py-4 text-center text-[11px] text-faint">Empty</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        {open && (
          <DialogContent
            side="right"
            title={`${open.candidate.name} → ${open.role.title}`}
            description={`Introduction · ${INTRO_LABELS[open.intro.status]}`}
          >
            <div className="space-y-5 p-5">
              <ol className="relative space-y-3 border-l border-line pl-4">
                {open.intro.history.map((h, i) => (
                  <li key={i} className="text-[13px]">
                    <span
                      className={cn(
                        "absolute -left-[5px] mt-1.5 size-2.5 rounded-full",
                        h.status === "DECLINED" || h.status === "CANCELLED" ? "bg-bad" : "bg-accent",
                      )}
                    />
                    <span className="font-medium text-ink">{INTRO_LABELS[h.status]}</span>{" "}
                    <span className="text-xs text-faint">{timeAgo(h.at)}</span>
                    {h.note && <div className="text-xs text-muted">{h.note}</div>}
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Fact
                  icon={<UserCheck className="size-3.5" />}
                  k="Requested by"
                  v={open.requestedBy ?? "—"}
                />
                <Fact
                  icon={<ShieldCheck className="size-3.5" />}
                  k="Candidate consent"
                  v={open.intro.candidateConsentAt ? timeAgo(open.intro.candidateConsentAt) : "not yet"}
                />
                <Fact
                  icon={<CheckCircle2 className="size-3.5" />}
                  k="Approved by"
                  v={open.approvedBy ?? "not yet"}
                />
                <Fact
                  icon={<Send className="size-3.5" />}
                  k="Delivery"
                  v={open.intro.deliveryChannel === "demo_internal" ? "internal demo record" : "email"}
                />
              </div>
              {open.intro.recruiterNote && (
                <p className="rounded-lg bg-panel-2 p-3 text-[13px] text-ink-2">
                  Note: {open.intro.recruiterNote}
                </p>
              )}
              {open.intro.draft && (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
                    Intro draft (cites the match evidence)
                  </div>
                  <Textarea
                    rows={10}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!["READY_FOR_APPROVAL", "APPROVED"].includes(open.intro.status)}
                    className="font-mono text-[12px]"
                    aria-label="Intro draft"
                  />
                  {["READY_FOR_APPROVAL", "APPROVED"].includes(open.intro.status) &&
                    draft !== open.intro.draft && (
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={async () => {
                          const r = await updateIntroDraftAction(open.intro.id, draft);
                          if (r.ok) toast.success("Draft saved");
                        }}
                      >
                        Save draft
                      </Button>
                    )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                {open.intro.status === "DRAFT" && (
                  <Button variant="primary" onClick={() => op(open, "consent")} disabled={busy}>
                    Ask candidate for consent
                  </Button>
                )}
                {open.intro.status === "AWAITING_CANDIDATE" && open.portal && (
                  <Button asChild>
                    <a href={open.portal} target="_blank" rel="noreferrer">
                      <Clock /> Waiting — open candidate portal (demo) <ExternalLink />
                    </a>
                  </Button>
                )}
                {open.intro.status === "READY_FOR_APPROVAL" &&
                  (open.canApprove ? (
                    <Button variant="accent" onClick={() => op(open, "approve")} disabled={busy}>
                      <CheckCircle2 /> Approve introduction
                    </Button>
                  ) : (
                    <Badge tone="warn">Your role can't approve intros</Badge>
                  ))}
                {open.intro.status === "APPROVED" && open.canApprove && (
                  <Button variant="primary" onClick={() => op(open, "send")} disabled={busy}>
                    <Send />{" "}
                    {messagingConfigured ? "Send introduction" : "Mark as sent (demo — no email integration)"}
                  </Button>
                )}
                {!["SENT", "DECLINED", "CANCELLED"].includes(open.intro.status) && (
                  <Button variant="ghost" onClick={() => op(open, "cancel")} disabled={busy}>
                    <X /> Cancel intro
                  </Button>
                )}
                {open.matchId && (
                  <Button variant="ghost" asChild>
                    <Link href={`/app/roles/${open.role.id}/matches/${open.matchId}`}>Open match</Link>
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Invalid transitions are rejected by the state machine (e.g. Draft → Sent). Nothing leaves the
                system without candidate consent and recruiter approval.
              </p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function Fact({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        {k}
      </div>
      <div className="mt-0.5 font-medium text-ink">{v}</div>
    </div>
  );
}
