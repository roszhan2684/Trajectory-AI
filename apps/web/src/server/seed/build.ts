/**
 * Deterministic demo seed. Everything goes through the real services: roles are parsed from
 * briefs by Role Intelligence, resumes are ingested by Profile Intelligence, matches come from
 * the ranking pipeline, and eval metrics are computed from labels — nothing is hard-coded.
 */
import { metroForCity, parseRoleBrief, slugify } from "@trajectory/engine";
import { emptyDB, type DB } from "../db/schema";
import { installDB, nextId } from "../db/store";
import { sha256 } from "../auth/tokens";
import { actorFor, setSeedClock, type Actor } from "../services/core";
import { runner } from "../services/jobs";
import { createRole, proposalToDraft } from "../services/roles";
import { ingestResumeText } from "../services/candidates";
import { rebuildIndex } from "../services/search";
import { generateMatches, runRoleMatching, setMatchStatus } from "../services/matches";
import { applyRefinement, proposeRefinement } from "../services/refinements";
import { applyCandidateAnswer, selectQuestions, startQualification } from "../services/conversations";
import {
  approveIntro,
  candidateConsent,
  cancelIntro,
  markIntroSent,
  requestConsent,
  requestIntro,
} from "../services/intros";
import { EVAL_CONFIGS, recordEvalRun } from "../services/evals";
import { runReconcileJob } from "../services/lab";
import { FLAGSHIP_CANDIDATES } from "./flagship";
import { generateCandidateSpecs } from "./generate";
import { renderResume, type CandidateSpec } from "./resume";
import { FAMILY_RELEVANCE, ORGS, ROLES, USERS } from "./roles";
import { Rng } from "./prng";

export const DEFAULT_SEED = 20261003;
const BASE = new Date("2026-10-02T17:00:00Z");
const daysAgo = (d: number, h = 0) => new Date(BASE.getTime() - d * 864e5 - h * 36e5);

export async function buildSeed(seed = DEFAULT_SEED, log: (s: string) => void = () => {}): Promise<DB> {
  const db = emptyDB(seed);
  installDB(db);
  const prevInline = runner.inline;
  runner.inline = true;
  const rng = new Rng(seed + 1);
  try {
    // ---------------------------------------------------------------- orgs, people, keys
    setSeedClock(daysAgo(200));
    const orgId: Record<string, string> = {};
    for (const o of ORGS) {
      const id = nextId(db, "org");
      orgId[o.key] = id;
      db.organizations.push({
        id,
        name: o.name,
        slug: o.slug,
        website: o.website,
        sizeBand: o.sizeBand,
        stage: o.stage,
        industry: o.industry,
        defaultTimezone: o.timezone,
        description: o.description,
        hiringManagersCanApproveIntros: o.hmApprove,
        createdAt: daysAgo(200).toISOString(),
      });
    }
    const userId: Record<string, string> = {};
    for (const u of USERS) {
      const id = nextId(db, "usr");
      userId[u.key] = id;
      db.users.push({
        id,
        email: u.email,
        displayName: u.displayName,
        title: u.title,
        avatarColor: u.color,
        createdAt: daysAgo(200).toISOString(),
      });
      for (const m of u.memberships)
        db.members.push({
          id: nextId(db, "mem"),
          organizationId: orgId[m.org]!,
          userId: id,
          role: m.role,
          invitedByUserId: null,
          joinedAt: daysAgo(190).toISOString(),
        });
      // Local-demo MCP key (documented as NOT production auth). Real keys are random & shown once.
      const secret = `trj_demo_${u.key}`;
      db.apiKeys.push({
        id: nextId(db, "key"),
        userId: id,
        organizationId: orgId[u.memberships[0]!.org]!,
        name: "Local demo key",
        prefix: secret.slice(0, 10),
        hash: sha256(secret),
        createdAt: daysAgo(150).toISOString(),
        lastUsedAt: null,
      });
    }
    const actor = (user: string, org: string): Actor => actorFor(userId[user]!, orgId[org]!, "system");
    log(`✓ ${db.organizations.length} organizations, ${db.users.length} people`);

    // ---------------------------------------------------------------- candidates (through ingestion)
    const flagshipNames = new Set(FLAGSHIP_CANDIDATES.map((c) => c.fullName));
    const specs: CandidateSpec[] = [
      ...FLAGSHIP_CANDIDATES,
      ...generateCandidateSpecs(seed, 140, flagshipNames),
    ];
    for (const s of specs) {
      const created = daysAgo(rng.int(20, 180), rng.int(0, 20));
      setSeedClock(created);
      const text = renderResume(s);
      const c = ingestResumeText(text, `${slugify(s.fullName)}-resume.pdf`, {
        id: s.id,
        synthetic: true,
        email: s.email,
        workAuthorization: s.workAuthorization,
        salaryMin: s.salaryMin,
        availability: s.availability,
        preferences: s.preferences,
        repos: s.repos,
        importedProfile: s.importedProfile ?? null,
        seniorities: s.experiences.map((e) => e.seniority) as number[],
        projectMeta: s.projects.map((p) => ({ shipped: p.shipped, startYear: p.year })),
      });
      c.metro = c.metro ?? metroForCity(c.city)?.key ?? null;
      db.candidates.push(c);
      db.latent.push({
        candidateId: c.id,
        archetype: s.latent.archetype,
        seniority: s.latent.seniority,
        indie: s.latent.indie,
        enterprise: s.latent.enterprise,
        labels: s.latent.labels,
      });
    }
    setSeedClock(daysAgo(19));
    rebuildIndex();
    log(
      `✓ ${db.candidates.length} synthetic candidates ingested · ${db.candidates.reduce((s, c) => s + c.evidence.length, 0)} evidence nodes · ${db.candidates.reduce((s, c) => s + c.claims.length, 0)} claims`,
    );

    // ---------------------------------------------------------------- roles (parsed from briefs)
    for (const r of ROLES) {
      const created = daysAgo(r.daysAgo, 2);
      setSeedClock(created);
      const a = actor(r.createdBy, r.org);
      const org = ORGS.find((o) => o.key === r.org)!;
      const proposal = parseRoleBrief(r.brief, { stage: org.stage, countryCode: "US" });
      const draft = proposalToDraft(proposal, r.brief);
      if (r.title) draft.title = r.title;
      const role = createRole(a, draft);
      db.roleKeys[r.key] = role.id;
      if (r.status !== "DRAFT") {
        role.status = r.status;
        role.activatedAt = daysAgo(r.daysAgo - 0.2).toISOString();
      }
    }
    log(`✓ ${db.roles.length} roles parsed from briefs · ${db.requirements.length} requirements`);

    // ---------------------------------------------------------------- matching
    for (const r of ROLES) {
      if (r.status === "DRAFT") continue;
      setSeedClock(daysAgo(Math.max(0.3, r.daysAgo - 0.5)));
      const id = db.roleKeys[r.key]!;
      if (r.key === "flagship" || r.key === "search")
        await generateMatches(actor(r.createdBy, r.org), id, "seed");
      else runRoleMatching(id, "seed");
    }
    log(`✓ ${db.matches.length} matches across ${db.matchRuns.length} ranking runs`);

    const top = (key: string, n: number) =>
      db.matches
        .filter((m) => m.roleId === db.roleKeys[key] && m.rank > 0)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, n);
    const matchFor = (key: string, candidateId: string) =>
      db.matches.find((m) => m.roleId === db.roleKeys[key] && m.candidateId === candidateId)!;

    // ---------------------------------------------------------------- historical recruiter feedback
    const reasons = ["location", "too_junior", "skills_gap", "comp", "not_startup", "too_senior"];
    const fbRoles: [string, string, string][] = [
      ["search", "priya", "northstar"],
      ["designer", "maya", "northstar"],
      ["workflows", "priya", "northstar"],
      ["data_eng", "jordan", "northstar"],
      ["helix_fe", "daniel", "helix"],
      ["helix_be", "daniel", "helix"],
      ["helix_ml", "daniel", "helix"],
      ["helix_sec", "daniel", "helix"],
      ["lumen_cpp", "elena", "lumen"],
      ["lumen_perception", "elena", "lumen"],
      ["lumen_infra", "elena", "lumen"],
    ];
    for (const [i, [key, user, org]] of fbRoles.entries()) {
      const ms = top(key, 8);
      const a = actor(user, org);
      setSeedClock(daysAgo(5 + (i % 9), 3));
      if (ms[0]) setMatchStatus(a, ms[0].id, "SHORTLISTED");
      if (ms[2]) setMatchStatus(a, ms[2].id, "REVIEWED");
      if (ms[5]) setMatchStatus(a, ms[5].id, "REJECTED", reasons[i % reasons.length]!);
      if (ms[7]) setMatchStatus(a, ms[7].id, "REJECTED", reasons[(i + 2) % reasons.length]!);
    }
    // flagship history (no preference changes — the demo refinement happens live)
    setSeedClock(daysAgo(4, 5));
    const jordan = actor("jordan", "northstar");
    setMatchStatus(jordan, matchFor("flagship", "cand_kenji").id, "SHORTLISTED");
    setMatchStatus(jordan, matchFor("flagship", "cand_leila").id, "SHORTLISTED");
    setMatchStatus(jordan, matchFor("flagship", "cand_hannah").id, "REVIEWED");
    log(`✓ ${db.feedback.length} recruiter feedback events`);

    // an applied refinement on the search role (shows history + preference model)
    setSeedClock(daysAgo(12));
    const priya = actor("priya", "northstar");
    const ref = proposeRefinement(priya, db.roleKeys.search!, {
      text: "Too big-company heavy. Prefer people who built search at early-stage startups.",
    });
    await applyRefinement(priya, ref.id);
    setSeedClock(daysAgo(9));
    const helixFe = proposeRefinement(actor("daniel", "helix"), db.roleKeys.helix_fe!, {
      text: "More healthcare experience please, and prefer design sensibility.",
    });
    await applyRefinement(actor("daniel", "helix"), helixFe.id);

    // ---------------------------------------------------------------- qualification conversations
    const tryQualify = (
      key: string,
      candidateId: string | null,
      user: string,
      org: string,
      answer: boolean,
      when: number,
    ) => {
      try {
        setSeedClock(daysAgo(when, 4));
        const m = candidateId ? matchFor(key, candidateId) : top(key, 3)[1];
        if (!m) return;
        const qs = selectQuestions(m, 2);
        if (!qs.length) return;
        const { conversation } = startQualification(
          actor(user, org),
          m.id,
          qs.map((q) => q.key),
        );
        if (answer) {
          setSeedClock(daysAgo(when - 1, 2));
          const q = qs[0]!;
          const value =
            q.answerKind === "choice" ? q.choices![0]! : q.answerKind === "number" ? 185000 : true;
          applyCandidateAnswer(conversation.portalToken, {
            key: q.key,
            value,
            freeText: q.key.startsWith("skill:")
              ? "Yes — ran it in production at my last company."
              : undefined,
          });
        }
      } catch (e) {
        log(`  (skipped qualification for ${key}: ${(e as Error).message})`);
      }
    };
    tryQualify("flagship", "cand_sofia", "jordan", "northstar", false, 3);
    tryQualify("flagship", "cand_leila", "jordan", "northstar", true, 4);
    tryQualify("search", null, "priya", "northstar", true, 8);
    tryQualify("helix_fe", null, "daniel", "helix", false, 2);
    tryQualify("lumen_cpp", null, "elena", "lumen", true, 6);
    tryQualify("data_eng", null, "jordan", "northstar", true, 5);
    log(`✓ ${db.conversations.length} qualification conversations`);

    // ---------------------------------------------------------------- introductions (all states)
    const intro = (
      key: string,
      m: { id: string } | undefined,
      user: string,
      org: string,
      to: string,
      when: number,
      note: string,
    ) => {
      if (!m) return;
      try {
        const a = actor(user, org);
        setSeedClock(daysAgo(when, 6));
        const i = requestIntro(a, m.id, note);
        if (to === "DRAFT") return;
        if (to === "CANCELLED") return void cancelIntro(a, i.id, "Role re-scoped; revisit next quarter");
        setSeedClock(daysAgo(when - 0.5, 5));
        const { link } = requestConsent(a, i.id);
        const token = link.split("/").pop()!;
        if (to === "AWAITING_CANDIDATE") return;
        setSeedClock(daysAgo(when - 1, 3));
        candidateConsent(token, to !== "DECLINED");
        if (to === "DECLINED" || to === "READY_FOR_APPROVAL") return;
        setSeedClock(daysAgo(when - 1.5, 2));
        approveIntro(a, i.id);
        if (to === "APPROVED") return;
        setSeedClock(daysAgo(when - 2, 1));
        markIntroSent(a, i.id);
      } catch (e) {
        log(`  (skipped intro for ${key}: ${(e as Error).message})`);
      }
    };
    intro(
      "flagship",
      matchFor("flagship", "cand_kenji"),
      "jordan",
      "northstar",
      "READY_FOR_APPROVAL",
      3,
      "Strong search depth — worth a call with Priya.",
    );
    intro(
      "flagship",
      matchFor("flagship", "cand_leila"),
      "jordan",
      "northstar",
      "AWAITING_CANDIDATE",
      2,
      "Two-time founding engineer; check comp flexibility.",
    );
    intro("search", top("search", 1)[0], "priya", "northstar", "SENT", 7, "Top of the refined ranking.");
    intro(
      "data_eng",
      top("data_eng", 1)[0],
      "jordan",
      "northstar",
      "READY_FOR_APPROVAL",
      3,
      "Great dbt + Airflow evidence.",
    );
    intro(
      "helix_fe",
      top("helix_fe", 2)[1],
      "daniel",
      "helix",
      "APPROVED",
      4,
      "Accessibility work is excellent.",
    );
    intro(
      "helix_be",
      top("helix_be", 1)[0],
      "daniel",
      "helix",
      "DECLINED",
      6,
      "Integration experience lines up.",
    );
    intro("lumen_cpp", top("lumen_cpp", 1)[0], "elena", "lumen", "DRAFT", 1, "Motion planning background.");
    intro(
      "lumen_perception",
      top("lumen_perception", 3)[2],
      "elena",
      "lumen",
      "CANCELLED",
      9,
      "Perception + C++.",
    );
    log(`✓ ${db.introductions.length} introductions`);

    // ---------------------------------------------------------------- eval dataset (oracle labels from latent attributes)
    setSeedClock(daysAgo(15));
    const dsId = nextId(db, "ds");
    db.evalDatasets.push({
      id: dsId,
      name: "Trajectory synthetic relevance v1",
      description:
        "Graded relevance (0–3) for role × candidate pairs, produced from generator intent (archetype, seniority, startup affinity, hard constraints) — independent of the ranker's features.",
      version: "1.0.0",
      createdAt: daysAgo(15).toISOString(),
    });
    const latent = new Map(db.latent.map((l) => [l.candidateId, l]));
    const lrng = new Rng(seed + 7);
    for (const r of ROLES) {
      const role = db.roles.find((x) => x.id === db.roleKeys[r.key])!;
      const roleMetro = metroForCity(role.city)?.key ?? null;
      const scored = db.candidates.map((c) => {
        const l = latent.get(c.id)!;
        let rel = l.labels[r.key] ?? FAMILY_RELEVANCE[r.family]?.[l.archetype] ?? 0;
        const explicit = l.labels[r.key] !== undefined;
        if (!explicit && rel > 0) {
          const yrs = c.yearsExperience ?? 0;
          if (role.minYears !== null && yrs < role.minYears - 1) rel -= 1;
          if (role.maxYears !== null && yrs > role.maxYears + 5) rel -= 1;
          const early = ["pre-seed", "seed", "series-a"].includes(role.companyStage);
          if (early && l.enterprise) rel -= 1;
          if (early && l.indie) rel += 1;
          const relocates = c.preferences.openToRelocate;
          // Labeling policy: explicit incompatibilities make a candidate non-relevant (a recruiter would pass).
          const mode = role.locationMode === "ONSITE" ? "onsite" : "hybrid";
          const modes = c.preferences.workModes;
          if (role.locationMode !== "REMOTE" && modes && !modes.includes(mode) && !modes.includes("onsite"))
            rel = 0;
          if (role.locationMode !== "REMOTE" && roleMetro && c.metro !== roleMetro && relocates === false)
            rel = 0;
          if (role.visaSupport === "NO" && c.workAuthorization === "needs_sponsorship") rel = 0;
          if (role.maxComp !== null && c.salaryMin !== null && c.salaryMin > role.maxComp * 1.15) rel = 0;
        }
        return {
          c,
          rel: Math.max(0, Math.min(3, rel)),
          base: FAMILY_RELEVANCE[r.family]?.[l.archetype] ?? 0,
          explicit,
        };
      });
      const positives = lrng
        .shuffle(scored.filter((x) => x.base > 0 || x.explicit))
        .sort((a, b) => Number(b.explicit) - Number(a.explicit))
        .slice(0, 18);
      const negatives = lrng.shuffle(scored.filter((x) => x.base === 0 && !x.explicit)).slice(0, 6);
      for (const x of [...positives, ...negatives]) {
        db.evalCases.push({
          id: nextId(db, "case"),
          datasetId: dsId,
          roleId: role.id,
          candidateId: x.c.id,
          expectedRelevance: x.rel,
          labels: [latent.get(x.c.id)!.archetype, x.explicit ? "handcrafted" : "oracle"],
          notes: x.explicit ? "Hand-labelled flagship candidate" : null,
        });
      }
    }
    for (const [i, cfg] of EVAL_CONFIGS.entries()) {
      setSeedClock(daysAgo(14 - i * 3));
      recordEvalRun(cfg, userId.priya!);
    }
    log(`✓ eval dataset: ${db.evalCases.length} labeled pairs · ${db.evalRuns.length} eval runs`);

    // ---------------------------------------------------------------- ops history: reconcile + an injected transient failure
    setSeedClock(daysAgo(1, 8));
    runner.injectFailures = 3;
    await runReconcileJob(null, false, 3); // fails 3× with transient errors → visible FAILED run
    runner.injectFailures = 0;
    setSeedClock(daysAgo(1, 7));
    await runReconcileJob(null, true);
    // leave one candidate with drift so the lab can demonstrate detection + repair
    const drift = db.candidates.find((c) => c.id === "cand_017");
    if (drift) {
      drift.headline = `${drift.headline} · open to founding roles`;
      drift.updatedAt = daysAgo(0, 20).toISOString();
      const st = db.indexState.find((s) => s.entityId === drift.id);
      if (st) st.status = "STALE";
    }
    setSeedClock(null);
    db.seededAt = new Date().toISOString();
    return db;
  } finally {
    runner.inline = prevInline;
    setSeedClock(null);
  }
}
