"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Lock, MessageSquare, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ConversationMessage } from "@trajectory/engine/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/overlays";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import {
  portalAnswerAction,
  portalConsentAction,
  portalInterestAction,
  portalPrefsAction,
} from "@/app/actions/portal";
import { cn, timeAgo } from "@/lib/utils";

export interface PortalProps {
  token: string;
  orgName: string;
  firstName: string;
  role: { title: string; where: string; comp: string | null; stage: string; team: string | null } | null;
  matchId: string | null;
  reasons: string[];
  messages: ConversationMessage[];
  introAwaiting: boolean;
  introStatus: string | null;
  prefs: { workModes: string[]; openToRelocate: boolean | null; wantsAiWork: boolean | null };
}

export function PortalClient(p: PortalProps) {
  const router = useRouter();
  const questions = p.messages.filter((m) => m.structured?.kind === "question");
  const answered = new Set(
    p.messages.filter((m) => m.structured?.kind === "answer").map((m) => m.structured!.uncertaintyKey),
  );
  const open = questions.filter((q) => !answered.has(q.structured!.uncertaintyKey));
  const interested = p.messages.some(
    (m) => m.structured?.kind === "interest" && m.senderType === "CANDIDATE" && m.structured.value === true,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <p className="text-[13px] text-muted">Hi {p.firstName} 👋</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          {p.orgName} thinks you could be a strong fit
          {p.role ? (
            <>
              {" "}
              for <span className="font-serif text-[28px] italic">{p.role.title}</span>
            </>
          ) : null}
          .
        </h1>
        {p.role && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{p.role.where}</Badge>
            {p.role.comp && <Badge tone="neutral">{p.role.comp}</Badge>}
            <Badge tone="neutral">{p.role.stage}</Badge>
            {p.role.team && <Badge tone="neutral">{p.role.team}</Badge>}
          </div>
        )}
        {p.reasons.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
              Why we reached out — based on your own resume
            </div>
            <ul className="space-y-1.5">
              {p.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-2">
                  <Check className="mt-1 size-3.5 shrink-0 text-good" /> {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.matchId && (
          <Link
            href={`/candidate/${p.token}/opportunity/${p.matchId}`}
            className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            See the full role <ChevronRight className="size-3.5" />
          </Link>
        )}
      </section>

      {p.introAwaiting && <ConsentCard token={p.token} orgName={p.orgName} onDone={() => router.refresh()} />}

      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">
            {open.length ? `${open.length} quick question${open.length > 1 ? "s" : ""}` : "Questions"}
          </h2>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Lock className="size-3" /> Only shared with {p.orgName}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          We only ask what we couldn't learn from your resume — no need to fill out a whole profile again.
        </p>
        <div className="mt-4 space-y-4">
          {open.map((q) => (
            <QuestionCard key={q.id} token={p.token} q={q} onDone={() => router.refresh()} />
          ))}
          {open.length === 0 && (
            <p className="rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good">
              All caught up — thank you!
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <h2 className="text-[15px] font-semibold text-ink">Interested?</h2>
        <p className="mt-1 text-[13px] text-muted">
          Nothing happens without your say-so. If you're interested, the team may ask your consent for an
          introduction.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={interested ? "secondary" : "primary"}
            onClick={async () => {
              const r = await portalInterestAction(p.token, true);
              if (r.ok) toast.success("Thanks — the team has been notified");
              router.refresh();
            }}
          >
            <ThumbsUp /> {interested ? "You said you're interested" : "I'm interested"}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const r = await portalInterestAction(p.token, false);
              if (r.ok) toast.success("Got it — we'll use this to improve future matches");
              router.refresh();
            }}
          >
            <ThumbsDown /> Not right now
          </Button>
        </div>
      </section>

      <Preferences token={p.token} initial={p.prefs} />

      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
          <MessageSquare className="size-4" /> History
        </h2>
        <ol className="space-y-2.5">
          {p.messages
            .filter((m) => m.structured?.kind !== "score_update")
            .map((m) => (
              <li
                key={m.id}
                className={cn("flex", m.senderType === "CANDIDATE" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px]",
                    m.senderType === "CANDIDATE" ? "bg-ink text-bg" : "bg-subtle text-ink-2",
                  )}
                >
                  {m.content}
                  <div className="mt-0.5 text-[10px] opacity-60">{timeAgo(m.createdAt)}</div>
                </div>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}

function QuestionCard({ token, q, onDone }: { token: string; q: ConversationMessage; onDone: () => void }) {
  const s = q.structured!;
  const [text, setText] = React.useState("");
  const [num, setNum] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ scoreBefore: number; scoreAfter: number } | null>(null);
  const job = useJob(jobId, jobId ? `/api/portal/${token}/jobs/${jobId}` : undefined, (j) => {
    if (j.status === "COMPLETED") {
      setResult(j.result as { scoreBefore: number; scoreAfter: number });
      setTimeout(onDone, 2200);
    }
    if (j.status === "FAILED") toast.error(j.error?.message ?? "Couldn't save your answer");
  });
  const send = async (value: boolean | number | string) => {
    const r = await portalAnswerAction(token, s.uncertaintyKey!, value, text || undefined);
    if (!r.ok) return toast.error(r.error.message);
    setJobId(r.data.jobId);
  };
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[14px] font-medium text-ink">{q.content}</p>
      {!jobId && (
        <div className="mt-3 space-y-2">
          {s.answerKind === "yes_no" && (
            <>
              <Textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Optional: add context (e.g. where, how long)"
                aria-label="Additional context"
              />
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => send(true)}>
                  Yes
                </Button>
                <Button onClick={() => send(false)}>No</Button>
              </div>
            </>
          )}
          {s.answerKind === "choice" && (
            <div className="flex flex-wrap gap-2">
              {(s.choices ?? []).map((c) => (
                <Button key={c} onClick={() => send(c)}>
                  {c}
                </Button>
              ))}
            </div>
          )}
          {s.answerKind === "number" && (
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                placeholder="e.g. 185000"
                value={num}
                onChange={(e) => setNum(e.target.value)}
                aria-label="Amount in USD"
              />
              <Button
                variant="primary"
                disabled={!num}
                onClick={() => send(Number(num.replace(/[^0-9]/g, "")))}
              >
                Submit
              </Button>
            </div>
          )}
        </div>
      )}
      {job && !result && <JobSteps job={job as never} title="Saving your answer" className="mt-3" />}
      {result && (
        <div className="mt-3 rounded-lg bg-good-soft px-3 py-2 text-[13px] text-good">
          Thanks — recorded as evidence from you.{" "}
          <span className="text-xs opacity-80">
            (Demo transparency: the team's match score moved {result.scoreBefore} → {result.scoreAfter}.)
          </span>
        </div>
      )}
    </div>
  );
}

function ConsentCard({ token, orgName, onDone }: { token: string; orgName: string; onDone: () => void }) {
  const answer = async (consent: boolean) => {
    const r = await portalConsentAction(token, consent);
    if (!r.ok) return toast.error(r.error.message);
    toast.success(
      consent
        ? "Consent recorded — a recruiter will review the intro before it's sent"
        : "No problem — no introduction will be made",
    );
    onDone();
  };
  return (
    <section className="rounded-2xl border-2 border-accent/40 bg-accent-soft/40 p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <ShieldCheck className="size-4 text-accent" /> {orgName} would like to introduce you to the hiring
        team
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        We only make introductions with your explicit consent, and a recruiter approves every intro before
        it's sent.
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="accent" onClick={() => answer(true)}>
          Yes, introduce me
        </Button>
        <Button variant="ghost" onClick={() => answer(false)}>
          No thanks
        </Button>
      </div>
    </section>
  );
}

function Preferences({ token, initial }: { token: string; initial: PortalProps["prefs"] }) {
  const [modes, setModes] = React.useState<string[]>(initial.workModes);
  const [reloc, setReloc] = React.useState<boolean>(initial.openToRelocate ?? false);
  const [ai, setAi] = React.useState<boolean>(initial.wantsAiWork ?? false);
  const save = async () => {
    const r = await portalPrefsAction(token, {
      workModes: modes as ("onsite" | "hybrid" | "remote")[],
      openToRelocate: reloc,
      wantsAiWork: ai,
    });
    if (!r.ok) return toast.error(r.error.message);
    toast.success("Preferences saved — future matches will respect them");
  };
  return (
    <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
      <h2 className="text-[15px] font-semibold text-ink">Your preferences</h2>
      <p className="mt-1 text-[13px] text-muted">These are first-class ranking inputs — you control them.</p>
      <div className="mt-4 space-y-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-40 text-ink-2">Work modes</span>
          {["onsite", "hybrid", "remote"].map((m) => (
            <button
              key={m}
              aria-pressed={modes.includes(m)}
              onClick={() => setModes((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs capitalize",
                modes.includes(m) ? "border-ink bg-ink text-bg" : "border-line text-muted",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="w-40 text-ink-2">Open to relocating</span>
          <Switch checked={reloc} onCheckedChange={setReloc} aria-label="Open to relocating" />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-40 text-ink-2">Want to build AI products</span>
          <Switch checked={ai} onCheckedChange={setAi} aria-label="Want to build AI products" />
        </label>
        <Button onClick={save}>Save preferences</Button>
      </div>
    </section>
  );
}
