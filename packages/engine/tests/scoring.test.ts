import { describe, expect, it } from "vitest";
import { NOW, makeCandidate, makeRole, STARTUP_ENGINEER, ENTERPRISE_ENGINEER } from "./factory";
import { buildCandidateContext, buildRoleContext } from "../src/scoring/context";
import { computeRerank, scoreCandidate } from "../src/scoring/score";
import {
  counterfactuals,
  whyNotHundred,
  generateExplanation,
  validateCitations,
} from "../src/scoring/explain";
import { DEFAULT_RANKING, DEFAULT_WEIGHTS } from "../src/scoring/config";
import { evaluateConstraints, aggregateConstraintStatus } from "../src/scoring/constraints";
import { PREFERENCE_FEATURES } from "../src/preferences";
import type { RolePreference } from "../src/types";

const cfg = DEFAULT_RANKING;

function setup(prefs: RolePreference[] = []) {
  const { role, reqs } = makeRole();
  const rc = buildRoleContext(role, reqs, prefs, NOW);
  return { role, reqs, rc };
}

describe("deterministic scoring", () => {
  it("baseline weights sum to 1", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("same inputs produce the same score", () => {
    const { rc } = setup();
    const c = makeCandidate({}, STARTUP_ENGINEER);
    const a = scoreCandidate(rc, buildCandidateContext(c, NOW), { config: cfg });
    const b = scoreCandidate(rc, buildCandidateContext(structuredClone(c), NOW), { config: cfg });
    expect(a.final).toBe(b.final);
    expect(a.components).toEqual(b.components);
  });

  it("component contributions sum exactly to the deterministic score", () => {
    const pref = (key: string, d: number): RolePreference => ({
      id: key,
      roleId: "r",
      key,
      weightDelta: d,
      source: "FEEDBACK",
      active: true,
      refinementId: null,
      createdByUserId: null,
      createdAt: NOW.toISOString(),
    });
    for (const prefs of [
      [],
      [pref("small_team_experience", 0.12), pref("enterprise_only_background", -0.08)],
    ]) {
      const { rc } = setup(prefs);
      for (const exps of [STARTUP_ENGINEER, ENTERPRISE_ENGINEER]) {
        const s = scoreCandidate(rc, buildCandidateContext(makeCandidate({}, exps), NOW), { config: cfg });
        const sum = s.components.reduce((acc, x) => acc + x.contribution, 0);
        expect(Math.abs(sum - s.deterministic)).toBeLessThan(1e-3);
        const fw = s.components.filter((x) => x.kind === "feature").reduce((acc, x) => acc + x.weight, 0);
        expect(fw).toBeCloseTo(1, 3);
      }
    }
  });

  it("why-not-100 items account for the full gap", () => {
    const { rc } = setup();
    const cc = buildCandidateContext(makeCandidate({}, STARTUP_ENGINEER), NOW);
    const rerank = computeRerank(rc, cc);
    const s = scoreCandidate(rc, cc, { config: cfg, rerank });
    const items = whyNotHundred(s, cfg);
    const lost = items.reduce((a, b) => a + b.pointsLost, 0);
    expect(Math.abs(lost - (100 - s.final * 100))).toBeLessThan(0.15);
    expect(items.every((i) => i.pointsLost >= 0)).toBe(true);
  });

  it("startup engineer outranks enterprise engineer for a seed-stage founding role", () => {
    const { rc } = setup();
    const a = scoreCandidate(rc, buildCandidateContext(makeCandidate({}, STARTUP_ENGINEER), NOW), {
      config: cfg,
    });
    const b = scoreCandidate(rc, buildCandidateContext(makeCandidate({}, ENTERPRISE_ENGINEER), NOW), {
      config: cfg,
    });
    expect(a.final).toBeGreaterThan(b.final);
  });

  it("recruiter preference deltas move ranking in the requested direction", () => {
    const base = setup();
    const ent = makeCandidate({}, ENTERPRISE_ENGINEER);
    const before = scoreCandidate(base.rc, buildCandidateContext(ent, NOW), { config: cfg });
    const neg: RolePreference = {
      id: "p",
      roleId: "r",
      key: "enterprise_only_background",
      weightDelta: -0.12,
      source: "FEEDBACK",
      active: true,
      refinementId: null,
      createdByUserId: null,
      createdAt: NOW.toISOString(),
    };
    const after = scoreCandidate(setup([neg]).rc, buildCandidateContext(ent, NOW), { config: cfg });
    expect(after.deterministic).toBeLessThan(before.deterministic);
  });

  it("non-allowlisted preference keys are ignored", () => {
    const evil: RolePreference = {
      id: "p",
      roleId: "r",
      key: "age_under_30",
      weightDelta: 0.3,
      source: "FEEDBACK",
      active: true,
      refinementId: null,
      createdByUserId: null,
      createdAt: NOW.toISOString(),
    };
    const c = makeCandidate({}, STARTUP_ENGINEER);
    const a = scoreCandidate(setup().rc, buildCandidateContext(c, NOW), { config: cfg });
    const b = scoreCandidate(setup([evil]).rc, buildCandidateContext(c, NOW), { config: cfg });
    expect(b.final).toBe(a.final);
    expect(b.components.some((x) => x.key === "pref:age_under_30")).toBe(false);
  });

  it("protected attributes are absent from the feature set", () => {
    const banned =
      /(^|_)(age|gender|sex|race|ethnicity|religion|disability|marital|pregnancy|orientation|nationality)(_|$)/i;
    expect(Object.keys(DEFAULT_WEIGHTS).some((k) => banned.test(k))).toBe(false);
    expect(PREFERENCE_FEATURES.some((p) => banned.test(p.key))).toBe(false);
  });
});

describe("hard constraints", () => {
  it("unknown relocation is UNKNOWN, explicit refusal is FAIL", () => {
    const { role, reqs } = makeRole();
    const remote = makeCandidate({ city: "Austin", region: "TX", metro: "austin" }, STARTUP_ENGINEER);
    remote.preferences.openToRelocate = null;
    const loc = (c: typeof remote) => evaluateConstraints(role, reqs, c).find((x) => x.key === "location")!;
    expect(loc(remote).status).toBe("UNKNOWN");
    remote.preferences.openToRelocate = false;
    expect(loc(remote).status).toBe("FAIL");
    remote.preferences.openToRelocate = true;
    expect(loc(remote).status).toBe("PASS");
  });

  it("sponsorship need fails only when the role cannot sponsor", () => {
    const c = makeCandidate({ workAuthorization: "needs_sponsorship" }, STARTUP_ENGINEER);
    const no = makeRole({ visaSupport: "NO" });
    const yes = makeRole({ visaSupport: "YES" });
    expect(aggregateConstraintStatus(evaluateConstraints(no.role, no.reqs, c))).toBe("FAIL");
    expect(
      evaluateConstraints(yes.role, yes.reqs, c).find((x) => x.key === "work_authorization")!.status,
    ).toBe("PASS");
  });

  it("unknown compensation is a soft check and never gates", () => {
    const c = makeCandidate({ salaryMin: null, salaryMax: null }, STARTUP_ENGINEER);
    const { role, reqs } = makeRole();
    const checks = evaluateConstraints(role, reqs, c);
    expect(checks.find((x) => x.key === "compensation")!.soft).toBe(true);
    expect(aggregateConstraintStatus(checks)).toBe("PASS");
  });
});

describe("explanations and counterfactuals", () => {
  it("counterfactual: confirming onsite raises the score deterministically", () => {
    const { rc } = setup();
    const c = makeCandidate({ city: "Oakland", metro: "austin" }, STARTUP_ENGINEER);
    c.preferences.openToRelocate = null;
    const cc = buildCandidateContext(c, NOW);
    const s = scoreCandidate(rc, cc, { config: cfg });
    const cfs = counterfactuals(rc, cc, s, s.uncertainties, cfg);
    const loc = cfs.find((x) => x.key === "constraint:location")!;
    expect(loc.finalAfter).toBeGreaterThan(loc.finalBefore);
    expect(loc.componentDeltas.some((d) => d.key === "location_fit" && d.delta > 0)).toBe(true);
  });

  it("explanations only cite evidence that exists", () => {
    const { rc } = setup();
    const c = makeCandidate({}, STARTUP_ENGINEER);
    const cc = buildCandidateContext(c, NOW);
    const rerank = computeRerank(rc, cc);
    const s = scoreCandidate(rc, cc, { config: cfg, rerank });
    const expl = generateExplanation(rc, cc, s, [], cfg, []);
    const v = validateCitations(expl, c);
    expect(v.total).toBeGreaterThan(0);
    expect(v.valid).toBe(v.total);
    for (const r of rerank.reasons)
      for (const id of r.evidenceIds) expect(c.evidence.some((n) => n.id === id)).toBe(true);
  });
});
