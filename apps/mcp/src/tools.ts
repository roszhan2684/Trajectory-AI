/**
 * Tool definitions. Read tools are side-effect free. Write tools are marked, never send anything
 * outward, and re-check authorization server-side via the API key's user + organization.
 */
import { z } from "zod";
import { ApiError, type ApiClient } from "./client";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  sideEffect: "none" | "draft" | "ranking_change";
  input: z.ZodRawShape;
  run: (client: ApiClient, args: Record<string, unknown>) => Promise<unknown>;
}

const id = (label: string) => z.string().min(1).max(64).describe(label);

export const TOOLS: ToolDef[] = [
  {
    name: "searchCandidates",
    title: "Search candidates",
    description:
      "Hybrid (keyword + semantic) search over the candidate pool. Accepts natural language like “TypeScript engineers in SF open to seed stage, 5+ years”; filters are interpreted and returned.",
    sideEffect: "none",
    input: { query: z.string().min(1).max(300), limit: z.number().int().min(1).max(25).default(10) },
    run: (c, a) =>
      c.get(`/candidates/search?q=${encodeURIComponent(String(a.query))}&limit=${Number(a.limit ?? 10)}`),
  },
  {
    name: "getCandidateProfile",
    title: "Get candidate profile",
    description:
      "Concise structured profile: experiences, skill claims with support status, preferences, flags and this org's matches. Raw source documents are never returned.",
    sideEffect: "none",
    input: { candidateId: id("Candidate ID, e.g. cand_ava") },
    run: (c, a) => c.get(`/candidates/${encodeURIComponent(String(a.candidateId))}`),
  },
  {
    name: "getRole",
    title: "Get role",
    description:
      "A role's structured requirements, hard constraints, active recruiter preferences and open ambiguities.",
    sideEffect: "none",
    input: { roleId: id("Role ID") },
    run: (c, a) => c.get(`/roles/${encodeURIComponent(String(a.roleId))}`),
  },
  {
    name: "listRoleMatches",
    title: "List role matches",
    description:
      "Ranked candidates for a role with score, confidence, hard-constraint status, top evidence-backed signals and open questions.",
    sideEffect: "none",
    input: { roleId: id("Role ID"), limit: z.number().int().min(1).max(50).default(10) },
    run: (c, a) =>
      c.get(`/roles/${encodeURIComponent(String(a.roleId))}/matches?limit=${Number(a.limit ?? 10)}`),
  },
  {
    name: "explainMatch",
    title: "Explain match",
    description:
      "Why this match, why not 100 (exact point decomposition), what would change the score (deterministic counterfactuals) and hard constraints — with evidence citations.",
    sideEffect: "none",
    input: { matchId: id("Match ID") },
    run: (c, a) => c.get(`/matches/${encodeURIComponent(String(a.matchId))}`),
  },
  {
    name: "getPipeline",
    title: "Get hiring pipeline",
    description:
      "Counts of matches per stage (new, shortlisted, qualifying, intro requested, introduced…) for every role or one role.",
    sideEffect: "none",
    input: { roleId: z.string().max(64).optional() },
    run: (c, a) => c.get(`/pipeline${a.roleId ? `?roleId=${encodeURIComponent(String(a.roleId))}` : ""}`),
  },
  {
    name: "getEvaluationSummary",
    title: "Get evaluation summary",
    description:
      "Latest offline ranking metrics (NDCG@10, P@5, R@10, MRR, constraint violations) and the public held-out benchmark for the fit model.",
    sideEffect: "none",
    input: {},
    run: (c) => c.get(`/evals/summary`),
  },
  {
    name: "createRoleDraft",
    title: "Create role draft",
    description:
      "SIDE EFFECT (draft only): parses a plain-language brief into a DRAFT role. It is NOT activated — a human must review and approve it in the app.",
    sideEffect: "draft",
    input: { brief: z.string().min(20).max(8000).describe("The hiring brief in plain language") },
    run: (c, a) => c.post(`/roles`, { text: a.brief }),
  },
  {
    name: "proposeRankingRefinement",
    title: "Propose ranking refinement",
    description:
      "SIDE EFFECT (proposal only): interprets feedback like “too enterprise, prioritize indie shippers” into allowlisted preference deltas. Ranking does NOT change until applied with confirm=true.",
    sideEffect: "draft",
    input: { roleId: id("Role ID"), feedback: z.string().min(4).max(1000) },
    run: (c, a) => c.post(`/roles/${encodeURIComponent(String(a.roleId))}/refinements`, { text: a.feedback }),
  },
  {
    name: "applyRankingRefinement",
    title: "Apply ranking refinement",
    description:
      "SIDE EFFECT (changes ranking): applies a previously proposed refinement and re-ranks the role. Requires confirm=true; only call after the user has reviewed the proposed deltas. Reversible in the app.",
    sideEffect: "ranking_change",
    input: {
      refinementId: id("Refinement ID from proposeRankingRefinement"),
      confirm: z.boolean().describe("Must be true — explicit human confirmation"),
    },
    run: async (c, a) => {
      if (a.confirm !== true)
        throw new ApiError(
          "VALIDATION",
          "Refusing to apply without confirm=true. Show the user the proposed deltas first.",
          422,
        );
      return c.post(`/refinements/${encodeURIComponent(String(a.refinementId))}/apply`, { confirm: true });
    },
  },
  {
    name: "requestIntroduction",
    title: "Request introduction",
    description:
      "SIDE EFFECT (draft only): creates an introduction DRAFT for a match. Nothing is sent — candidate consent and recruiter approval happen in the app.",
    sideEffect: "draft",
    input: { matchId: id("Match ID"), note: z.string().max(1000).optional() },
    run: (c, a) => c.post(`/intros`, { matchId: a.matchId, note: a.note ?? null }),
  },
];

/** Execute a tool with input validation and structured, secret-free errors. */
export async function runTool(client: ApiClient, name: string, raw: unknown) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false as const, error: { code: "UNKNOWN_TOOL", message: `No tool named ${name}` } };
  const parsed = z.object(tool.input).safeParse(raw ?? {});
  if (!parsed.success)
    return {
      ok: false as const,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
    };
  try {
    return { ok: true as const, data: await tool.run(client, parsed.data) };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false as const, error: { code: e.code, message: e.message } };
    return {
      ok: false as const,
      error: {
        code: "UNAVAILABLE",
        message: "Trajectory API is unreachable. Is the web app running and TRAJECTORY_API_URL correct?",
      },
    };
  }
}
