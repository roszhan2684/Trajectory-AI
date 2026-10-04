/** Dev helper: print a role's ranking with component breakdown (used to sanity-check the demo). */
import { buildSeed } from "../src/server/seed/build";
import { runRoleMatching } from "../src/server/services/matches";
import { getDB } from "../src/server/db/store";

const key = process.argv[2] ?? "flagship";
await buildSeed();
const db = getDB();
const roleId = db.roleKeys[key]!;
const show = (title: string) => {
  console.log(`\n== ${title}`);
  const ms = db.matches
    .filter((m) => m.roleId === roleId && m.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 14);
  for (const m of ms) {
    const c = db.candidates.find((x) => x.id === m.candidateId)!;
    const comp = m.components
      .map((x) => `${x.key.replace("pref:", "+").slice(0, 10)}=${x.normalizedValue.toFixed(2)}`)
      .join(" ");
    console.log(
      `#${String(m.rank).padStart(2)} ${(m.finalScore * 100).toFixed(1)} det=${m.deterministicScore.toFixed(2)} sem=${m.semanticScore?.toFixed(2)} rr=${m.rerankScore?.toFixed(2)} conf=${m.confidenceScore.toFixed(2)} ${m.hardConstraintStatus.padEnd(7)} ${c.fullName.padEnd(18)} ${comp}`,
    );
  }
  const f = db.matches.filter((m) => m.roleId === roleId && m.rank === -1);
  console.log(
    `filtered: ${f.map((m) => db.candidates.find((c) => c.id === m.candidateId)!.fullName).join(", ")}`,
  );
};
show("before refinement");
const role = db.roles.find((r) => r.id === roleId)!;
console.log(
  "reqs:",
  db.requirements
    .filter((r) => r.roleId === roleId)
    .map((r) => `${r.normalizedKey}:${r.importance}${r.isHardConstraint ? "!" : ""}`)
    .join(" "),
  "| mode",
  role.locationMode,
  role.city,
  "years",
  role.minYears,
  role.maxYears,
  "team",
  role.teamSize,
  "stage",
  role.companyStage,
);
if (key === "flagship") {
  const ts = new Date().toISOString();
  for (const [k, d] of [
    ["enterprise_only_background", -0.08],
    ["independent_product_ownership", 0.18],
    ["small_team_experience", 0.12],
  ] as const) {
    db.rolePreferences.push({
      id: k,
      roleId,
      key: k,
      weightDelta: d,
      source: "FEEDBACK",
      active: true,
      refinementId: null,
      createdByUserId: null,
      createdAt: ts,
    });
  }
  runRoleMatching(roleId, "refinement");
  show("after 'too enterprise' refinement");
}
