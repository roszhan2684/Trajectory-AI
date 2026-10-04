import { apiActor, handle } from "@/server/http";
import { getMatchDetail } from "@/server/services/matches";

/** explainMatch — explanation, why-not-100 and counterfactuals with evidence citations. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const { match: m, candidate: c, role } = getMatchDetail(actor, id);
    const ev = new Map(c.evidence.map((n) => [n.id, n]));
    const cite = (ids: string[]) =>
      ids
        .map((x) => ev.get(x))
        .filter(Boolean)
        .map((n) => ({ id: n!.id, type: n!.type, title: n!.title, excerpt: n!.body.slice(0, 160) }));
    return {
      matchId: m.id,
      role: role.title,
      candidate: c.fullName,
      score: Math.round(m.finalScore * 1000) / 10,
      layers: {
        deterministic: m.deterministicScore,
        semantic: m.semanticScore,
        rerank: m.rerankScore,
        confidence: m.confidenceScore,
      },
      summary: m.explanation?.summary,
      whyMatch: m.explanation?.whyMatch.map((w) => ({ text: w.text, evidence: cite(w.evidenceIds) })),
      risks: m.explanation?.risks.map((r) => ({ text: r.text, kind: r.kind })),
      whyNot100: m.explanation?.whyNotHundred.slice(0, 6),
      whatWouldChangeTheScore: m.explanation?.counterfactuals
        .slice(0, 4)
        .map((c2) => ({ scenario: c2.scenario, from: c2.finalBefore, to: c2.finalAfter })),
      hardConstraints: m.constraints.map((k) => ({ label: k.label, status: k.status, detail: k.detail })),
    };
  });
}
