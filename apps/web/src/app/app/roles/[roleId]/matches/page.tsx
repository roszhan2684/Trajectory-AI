import { notFound } from "next/navigation";
import { DomainError, PIPELINE_LIMITS, SCORE_VERSION } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { listMatches } from "@/server/services/matches";
import { getRole } from "@/server/services/roles";
import { getDB } from "@/server/db/store";
import { PageHeader } from "@/components/page-header";
import { MatchBoard, type BoardRow } from "@/components/matches/match-board";
import type { Candidate, Match } from "@trajectory/engine";

function intent(
  c: Candidate,
  m: Match,
  convAnswered: boolean,
): { label: string; tone: "good" | "info" | "unknown" | "warn" } {
  if (["INTERESTED", "INTRO_REQUESTED", "INTRODUCED"].includes(m.status))
    return { label: "Interested", tone: "good" };
  if (m.status === "QUALIFYING") return { label: convAnswered ? "Responding" : "Asked", tone: "info" };
  if (c.availability === "not_looking") return { label: "Not looking", tone: "warn" };
  if (c.preferences.wantsAiWork || c.preferences.desiredStages)
    return { label: "Stated prefs", tone: "unknown" };
  return { label: "Intent unknown", tone: "unknown" };
}

function short(t: string, n = 90, stripLabel = true) {
  const s = stripLabel ? t.replace(/^[^:]{2,40}:\s*/, "") : t;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default async function MatchesPage({ params }: { params: Promise<{ roleId: string }> }) {
  const actor = await requireActor();
  const { roleId } = await params;
  let data;
  try {
    data = listMatches(actor, roleId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { role, ranked, filtered, lastRun } = data;
  const { refinements, preferences } = getRole(actor, roleId);
  const db = getDB();
  const convByMatch = new Map(db.conversations.map((c) => [c.matchId, c]));

  const toRow = ({ match: m, candidate: c }: (typeof ranked)[number]): BoardRow => {
    const conv = convByMatch.get(m.id);
    return {
      id: m.id,
      rank: m.rank,
      previousRank: m.previousRank,
      score: m.finalScore,
      previousScore: m.previousFinalScore,
      deterministic: m.deterministicScore,
      semantic: m.semanticScore,
      rerank: m.rerankScore,
      confidence: m.confidenceScore,
      constraint: m.hardConstraintStatus,
      status: m.status,
      candidate: {
        id: c.id,
        name: c.fullName,
        title: c.currentTitle ?? c.headline,
        company: c.currentCompany,
        location: [c.city, c.region].filter(Boolean).join(", "),
        years: c.yearsExperience,
        sources: [...new Set(c.sources.map((s) => s.sourceType))],
        answered: c.evidence.some((n) => n.type === "ANSWER"),
        flags: c.flags.map((f) => f.kind),
      },
      signals: (m.explanation?.whyMatch ?? []).slice(0, 3).map((w) => short(w.text)),
      risks: [
        ...new Set([
          ...m.constraints.filter((k) => k.status !== "PASS").map((k) => k.detail),
          ...[...m.uncertainties]
            .sort((a, b) => b.expectedImpact - a.expectedImpact)
            .slice(0, 3)
            .map((u) => u.description),
        ]),
      ]
        .slice(0, 2)
        .map((t) => short(t, 80, false)),
      failReasons: m.constraints.filter((k) => k.status === "FAIL").map((k) => k.detail),
      intent: intent(c, m, Boolean(conv?.messages.some((x) => x.senderType === "CANDIDATE"))),
      openQuestions: m.uncertainties.filter((u) => !u.resolvedAt).length,
    };
  };

  const latest = refinements.find((r) => r.status === "APPLIED" && r.after) ?? null;
  const nameOf = new Map(db.candidates.map((c) => [c.id, c.fullName]));
  // Union of before/after top 10 so drops are as visible as rises.
  const movement =
    latest?.before && latest.after
      ? [...new Set([...latest.before.slice(0, 10), ...latest.after.slice(0, 10)].map((x) => x.candidateId))]
          .map((id) => {
            const a = latest.after!.find((x) => x.candidateId === id);
            const b = latest.before!.find((x) => x.candidateId === id);
            return {
              candidateId: id,
              name: nameOf.get(id) ?? id,
              before: b?.rank ?? null,
              after: a?.rank ?? 99,
              scoreBefore: b?.finalScore ?? null,
              scoreAfter: a?.finalScore ?? 0,
            };
          })
          .sort((x, y) => x.after - y.after)
      : null;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Roles", href: "/app/roles" },
          { label: role.title, href: `/app/roles/${role.id}` },
          { label: "Matches" },
        ]}
        title={role.title}
        description={`${role.locationMode.toLowerCase()}${role.city ? ` · ${role.city}` : ""} · ${ranked.length} ranked · ${filtered.length} failed hard constraints · scoring ${lastRun?.scoreVersion ?? SCORE_VERSION}`}
      />
      <MatchBoard
        role={{ id: role.id, title: role.title, status: role.status }}
        rows={ranked.map(toRow)}
        filtered={filtered.map(toRow)}
        pool={db.candidates.length}
        retrieved={lastRun?.retrieved ?? ranked.length + filtered.length}
        rerankTopN={PIPELINE_LIMITS.rerankTopN}
        lastRun={
          lastRun ? { at: lastRun.completedAt, trigger: lastRun.trigger, traceId: lastRun.traceId } : null
        }
        caps={actor.caps}
        activePreferences={preferences
          .filter((p) => p.active)
          .map((p) => ({ key: p.key, delta: p.weightDelta }))}
        lastRefinement={
          latest
            ? {
                id: latest.id,
                text: db.feedback.find((f) => f.id === latest.feedbackId)?.freeText ?? "",
                at: latest.appliedAt!,
                movement: movement ?? [],
                proposals: latest.proposals,
              }
            : null
        }
      />
    </>
  );
}
