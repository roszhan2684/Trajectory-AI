import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/ml-parity.json";
import { docInfo, pairFeatures, predictProbabilities } from "../src/ml/reranker";

/** The TypeScript inference path must reproduce the Python training pipeline. */
describe("ML parity with ml/train.py", () => {
  for (const [i, fx] of (
    fixtures as { role: string; candidate: string; scalars: number[]; probs: number[]; skills: string[] }[]
  ).entries()) {
    it(`fixture ${i}: features + probabilities match`, () => {
      const role = docInfo(fx.role, 2024);
      const cand = docInfo(fx.candidate, 2024);
      expect([...role.skills].sort()).toEqual(fx.skills);
      const f = pairFeatures(role, cand);
      f.scalars.forEach((v, j) => expect(Math.abs(v - fx.scalars[j]!)).toBeLessThan(2e-3));
      const p = predictProbabilities(f);
      p.forEach((v, j) => expect(Math.abs(v - fx.probs[j]!)).toBeLessThan(5e-3));
    });
  }
});
