/**
 * Data for the public site, computed from the live demo dataset with the real engine — the
 * landing page's ranking replay is not a mock-up.
 */
import {
  DEFAULT_RANKING,
  RERANKER,
  buildRoleContext,
  computeTrajectory,
  runMatchingPipeline,
  type RolePreference,
} from "@trajectory/engine";
import { getDB } from "./db/store";
import { candidateContext, getIndex } from "./services/search";
import { clock } from "./services/matches";

const DEMO_FEEDBACK =
  "These candidates feel too enterprise. Prioritize people who independently shipped products in teams under 30.";
const DEMO_DELTAS: [string, number][] = [
  ["enterprise_only_background", -0.08],
  ["independent_product_ownership", 0.18],
  ["small_team_experience", 0.12],
];

const g = globalThis as unknown as { __trajectoryLanding?: { key: string; data: LandingData } };

export interface LandingRow {
  id: string;
  name: string;
  title: string;
  score: number;
  rank: number;
  enterprise: boolean;
  indie: boolean;
}

export interface LandingData {
  role: { title: string; where: string };
  before: LandingRow[];
  after: LandingRow[];
  feedback: string;
  deltas: { key: string; delta: number }[];
  evidence: {
    candidate: string;
    claim: string;
    status: string;
    excerptBefore: string;
    excerpt: string;
    excerptAfter: string;
  } | null;
  whyNot: { label: string; points: number; kind: string }[];
  whyNotScore: number | null;
  trajectory: {
    name: string;
    heading: string;
    points: { label: string; start: number; end: number; alignment: number; kind: string }[];
  } | null;
  stats: {
    candidates: number;
    roles: number;
    evidence: number;
    claims: number;
    evalNdcg: number | null;
    evalViolationsBaseline: number | null;
    extNdcg: number;
    extTfidf: number;
    extPairs: number;
  };
}

export function landingData(): LandingData {
  const db = getDB();
  const key = `${db.seededAt}:${db.matchRuns.length}`;
  if (g.__trajectoryLanding?.key === key) return g.__trajectoryLanding.data;
  const roleId = db.roleKeys.flagship!;
  const role = db.roles.find((r) => r.id === roleId)!;
  const reqs = db.requirements.filter((r) => r.roleId === roleId);
  const contexts = new Map(db.candidates.map((c) => [c.id, candidateContext(c)]));
  const latent = new Map(db.latent.map((l) => [l.candidateId, l]));
  const prefs: RolePreference[] = DEMO_DELTAS.map(([k, d], i) => ({
    id: `lp${i}`,
    roleId,
    key: k,
    weightDelta: d,
    source: "FEEDBACK",
    active: true,
    refinementId: null,
    createdByUserId: null,
    createdAt: clock().toISOString(),
  }));
  const run = (p: RolePreference[]) =>
    runMatchingPipeline(buildRoleContext(role, reqs, p, clock()), contexts, getIndex(), {
      config: DEFAULT_RANKING,
      explain: false,
    })
      .ranked.slice(0, 8)
      .map((s, i) => {
        const c = contexts.get(s.candidateId)!.c;
        const l = latent.get(c.id);
        return {
          id: c.id,
          name: c.fullName,
          title: c.currentTitle ?? c.headline,
          score: s.final,
          rank: i + 1,
          enterprise: !!l?.enterprise,
          indie: !!l?.indie,
        };
      });
  const before = run([]);
  const after = run(prefs);

  const top = db.matches.find((m) => m.roleId === roleId && m.rank === 1);
  const topC = top && db.candidates.find((c) => c.id === top.candidateId);
  let evidence: LandingData["evidence"] = null;
  if (topC) {
    const frag = (n: (typeof topC.evidence)[number]) =>
      n.type === "RESUME_FRAGMENT" && n.startOffset !== null && !n.tags.includes("self_listed");
    const node =
      topC.evidence.find((n) => frag(n) && n.tags.includes("ai_shipped")) ?? topC.evidence.find(frag);
    const src = topC.sources.find((s) => s.id === node?.sourceId)?.text;
    if (node && src) {
      const linked = topC.claims.filter((cl) =>
        topC.claimLinks.some((l) => l.claimId === cl.id && l.evidenceNodeId === node.id),
      );
      const claim =
        linked.find((cl) => cl.claimKey === "llm") ??
        linked.find((cl) => cl.claimType === "skill") ??
        linked[0];
      evidence = {
        candidate: topC.fullName,
        claim: claim?.claimValue ?? "LLM applications",
        status: claim?.status ?? "SUPPORTED",
        excerptBefore: src
          .slice(Math.max(0, node.startOffset! - 90), node.startOffset!)
          .replace(/^\S*\s/, "…"),
        excerpt: src.slice(node.startOffset!, node.endOffset!),
        excerptAfter: src.slice(node.endOffset!, node.endOffset! + 80).replace(/\s\S*$/, "…"),
      };
    }
  }
  const whyNot = (top?.explanation?.whyNotHundred ?? [])
    .slice(0, 5)
    .map((w) => ({ label: w.label, points: w.pointsLost, kind: w.kind }));

  const sofia = db.candidates.find((c) => c.id === "cand_sofia");
  let trajectory: LandingData["trajectory"] = null;
  if (sofia) {
    const t = computeTrajectory(buildRoleContext(role, reqs, [], clock()), contexts.get(sofia.id)!);
    trajectory = {
      name: sofia.fullName,
      heading: t.heading,
      points: t.points
        .filter((p) => p.kind === "experience")
        .map((p) => ({ label: p.label, start: p.start, end: p.end, alignment: p.alignment, kind: p.kind })),
    };
  }
  const full = [...db.evalRuns].reverse().find((r) => r.name.startsWith("Full"));
  const bm25 = [...db.evalRuns].reverse().find((r) => r.name.startsWith("Keyword"));
  const ext = RERANKER.testResults as Record<string, { ndcg10?: number }>;
  const data: LandingData = {
    role: { title: role.title, where: `${role.locationMode.toLowerCase()} · ${role.city}` },
    before,
    after,
    feedback: DEMO_FEEDBACK,
    deltas: DEMO_DELTAS.map(([k, d]) => ({ key: k, delta: d })),
    evidence,
    whyNot,
    whyNotScore: top?.finalScore ?? null,
    trajectory,
    stats: {
      candidates: db.candidates.length,
      roles: db.roles.length,
      evidence: db.candidates.reduce((s, c) => s + c.evidence.length, 0),
      claims: db.candidates.reduce((s, c) => s + c.claims.length, 0),
      evalNdcg: full?.metrics?.ndcgAt10 ?? null,
      evalViolationsBaseline: bm25?.metrics?.hardConstraintViolationRate ?? null,
      extNdcg: ext.mlp?.ndcg10 ?? 0,
      extTfidf: ext.tfidfCosine?.ndcg10 ?? 0,
      extPairs: Number((RERANKER.training as { testPairs?: number }).testPairs ?? 0),
    },
  };
  g.__trajectoryLanding = { key, data };
  return data;
}
