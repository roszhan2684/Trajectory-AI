import { describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client";
import { TOOLS, runTool } from "../src/tools";

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
}

describe("MCP tool handlers", () => {
  it("exposes the 11 tools from the spec, with side effects marked", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "applyRankingRefinement",
        "createRoleDraft",
        "explainMatch",
        "getCandidateProfile",
        "getEvaluationSummary",
        "getPipeline",
        "getRole",
        "listRoleMatches",
        "proposeRankingRefinement",
        "requestIntroduction",
        "searchCandidates",
      ].sort(),
    );
    expect(
      TOOLS.filter((t) => t.sideEffect !== "none")
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "applyRankingRefinement",
      "createRoleDraft",
      "proposeRankingRefinement",
      "requestIntroduction",
    ]);
  });

  it("sends the API key as a bearer token and unwraps the envelope", async () => {
    const f = fakeFetch((url, init) => {
      expect(url).toBe("http://x/api/v1/candidates/search?q=typescript&limit=5");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer trj_test");
      return { body: { ok: true, data: { found: 1 } } };
    });
    const r = await runTool(createClient("http://x", "trj_test", f), "searchCandidates", {
      query: "typescript",
      limit: 5,
    });
    expect(r).toEqual({ ok: true, data: { found: 1 } });
  });

  it("validates input before calling the API", async () => {
    const f = fakeFetch(() => ({ body: { ok: true, data: {} } }));
    const r = await runTool(createClient("http://x", "k", f), "createRoleDraft", { brief: "too short" });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses to apply a refinement without explicit confirmation", async () => {
    const f = fakeFetch(() => ({ body: { ok: true, data: {} } }));
    const r = await runTool(createClient("http://x", "k", f), "applyRankingRefinement", {
      refinementId: "ref_1",
      confirm: false,
    });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(f).not.toHaveBeenCalled();
  });

  it("surfaces server-side authorization errors without leaking details", async () => {
    const f = fakeFetch(() => ({
      status: 403,
      body: {
        ok: false,
        error: { code: "FORBIDDEN", message: "Your role (Viewer) can't perform this action." },
      },
    }));
    const r = await runTool(createClient("http://x", "k", f), "requestIntroduction", { matchId: "mat_1" });
    expect(r).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Your role (Viewer) can't perform this action." },
    });
  });
});
