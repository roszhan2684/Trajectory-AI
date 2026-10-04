import { describe, expect, it } from "vitest";
import { LocalHybridIndex } from "../src/search/index";
import { buildSearchDocument, documentHash } from "../src/search/document";
import { parseNaturalQuery } from "../src/search/query";
import { ndcgAtK, precisionAtK, recallAtK, reciprocalRank } from "../src/evals/metrics";
import { can, assertCan } from "../src/policy/rbac";
import { assertTransition, canTransition } from "../src/policy/intro";
import { embed } from "../src/ml/lsa";
import { makeCandidate, STARTUP_ENGINEER, ENTERPRISE_ENGINEER } from "./factory";

describe("local hybrid search", () => {
  const a = makeCandidate(
    { id: "a", fullName: "Ava", headline: "Founding engineer, TypeScript + LLM" },
    STARTUP_ENGINEER,
  );
  const b = makeCandidate(
    {
      id: "b",
      fullName: "Ben",
      headline: "Senior engineer, Java + Elasticsearch",
      city: "Seattle",
      metro: "seattle",
    },
    ENTERPRISE_ENGINEER,
  );
  const idx = new LocalHybridIndex();
  idx.upsert(buildSearchDocument(a));
  idx.upsert(buildSearchDocument(b));

  it("keyword search ranks the matching profile first", () => {
    expect(idx.search({ text: "elasticsearch java" }).hits[0]!.id).toBe("b");
    expect(idx.search({ text: "llm rag" }).hits[0]!.id).toBe("a");
  });
  it("filters and facets", () => {
    const r = idx.search({ text: "", filters: { metros: ["seattle"] }, facetBy: ["metro"] });
    expect(r.hits.map((h) => h.id)).toEqual(["b"]);
    expect(r.facets.metro).toEqual([{ value: "seattle", count: 1 }]);
  });
  it("hybrid fusion uses both keyword and vector ranks", () => {
    const r = idx.search({
      text: "typescript",
      vector: embed("LLM product engineer building RAG features"),
      limit: 5,
    });
    expect(r.mode).toBe("hybrid");
    expect(r.hits[0]!.id).toBe("a");
    expect(r.hits[0]!.keywordRank).not.toBeNull();
    expect(r.hits[0]!.vectorRank).not.toBeNull();
  });
  it("content hash changes when indexed content changes (drift detection)", () => {
    const h1 = documentHash(buildSearchDocument(a));
    const a2 = structuredClone(a);
    a2.headline = "Changed";
    expect(documentHash(buildSearchDocument(a2))).not.toBe(h1);
  });
  it("parses natural queries into structured filters", () => {
    const q = parseNaturalQuery("TypeScript engineers in SF open to seed stage, 5+ years");
    expect(q.filters.skills).toContain("typescript");
    expect(q.filters.metros).toEqual(["sf_bay"]);
    expect(q.filters.stages).toContain("seed");
    expect(q.filters.minYears).toBe(5);
  });
});

describe("ranking metrics", () => {
  it("compute known values", () => {
    const ranked = ["a", "b", "c", "d"];
    expect(precisionAtK(ranked, new Set(["a", "c"]), 2)).toBe(0.5);
    expect(recallAtK(ranked, new Set(["a", "c", "z"]), 4)).toBeCloseTo(2 / 3);
    expect(reciprocalRank(ranked, new Set(["c"]))).toBeCloseTo(1 / 3);
    expect(
      ndcgAtK(
        ["a", "b"],
        new Map([
          ["a", 3],
          ["b", 0],
        ]),
        10,
      ),
    ).toBe(1);
    expect(
      ndcgAtK(
        ["b", "a"],
        new Map([
          ["a", 3],
          ["b", 0],
        ]),
        10,
      ),
    ).toBeCloseTo(1 / Math.log2(3));
  });
});

describe("policy", () => {
  it("RBAC matrix matches the spec", () => {
    expect(can("VIEWER", "candidates.search")).toBe(true);
    expect(can("VIEWER", "ranking.refine")).toBe(false);
    expect(can("RECRUITER", "members.invite")).toBe(false);
    expect(can("HIRING_MANAGER", "intro.approve", { hiringManagersCanApproveIntros: false })).toBe(false);
    expect(can("HIRING_MANAGER", "intro.approve", { hiringManagersCanApproveIntros: true })).toBe(true);
    expect(() => assertCan("VIEWER", "roles.edit")).toThrow(/can't perform/);
  });
  it("intro state machine rejects invalid transitions", () => {
    expect(canTransition("DRAFT", "AWAITING_CANDIDATE")).toBe(true);
    expect(() => assertTransition("DRAFT", "SENT")).toThrow();
    expect(() => assertTransition("AWAITING_CANDIDATE", "APPROVED")).toThrow();
    expect(() => assertTransition("SENT", "CANCELLED")).toThrow();
  });
});
