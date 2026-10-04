/** Zod schemas for every external input (forms, server actions, REST, MCP). */
import { z } from "zod";

export const requirementInput = z.object({
  category: z.enum([
    "SKILL",
    "EXPERIENCE",
    "DOMAIN",
    "EDUCATION",
    "LOCATION",
    "AUTHORIZATION",
    "COMPENSATION",
    "WORK_STYLE",
    "OTHER",
  ]),
  label: z.string().trim().min(1).max(120),
  normalizedKey: z.string().trim().min(1).max(80),
  importance: z.enum(["MUST", "STRONG", "NICE"]),
  isHardConstraint: z.boolean().default(false),
  sourceText: z.string().max(600).default(""),
  confidence: z.number().min(0).max(1).default(1),
});

export const roleDraftInput = z.object({
  title: z.string().trim().min(2).max(120),
  descriptionRaw: z.string().max(8000).default(""),
  locationMode: z.enum(["ONSITE", "HYBRID", "REMOTE"]),
  city: z.string().trim().max(80).nullable().default(null),
  region: z.string().trim().max(80).nullable().default(null),
  countryCode: z.string().trim().length(2).default("US"),
  minComp: z.number().int().min(0).max(2_000_000).nullable().default(null),
  maxComp: z.number().int().min(0).max(2_000_000).nullable().default(null),
  currency: z.string().max(3).nullable().default("USD"),
  visaSupport: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  employmentType: z.string().max(20).default("FULL_TIME"),
  minYears: z.number().min(0).max(40).nullable().default(null),
  maxYears: z.number().min(0).max(40).nullable().default(null),
  companyStage: z.enum(["pre-seed", "seed", "series-a", "series-b", "growth", "public"]),
  teamSize: z.number().int().min(1).max(1_000_000).nullable().default(null),
  domain: z.string().max(40).nullable().default(null),
  responsibilities: z.array(z.string().max(300)).max(20).default([]),
  requirements: z.array(requirementInput).max(60),
  parse: z
    .object({
      parserVersion: z.string(),
      fieldConfidence: z.record(z.string(), z.number()),
      fieldSources: z.record(z.string(), z.string()),
      ambiguities: z.array(
        z.object({ key: z.string(), question: z.string(), severity: z.enum(["low", "medium", "high"]) }),
      ),
      protectedTraitWarnings: z.array(z.string()),
      injectionFlags: z.array(z.string()),
    })
    .nullable()
    .default(null),
});
export type RoleDraftInput = z.infer<typeof roleDraftInput>;

export const briefInput = z.object({
  text: z.string().trim().min(20, "Describe the role in at least a sentence or two.").max(8000),
});
export const resumeInput = z.object({
  text: z.string().trim().min(80, "That looks too short to be a resume.").max(60_000),
  filename: z.string().max(200).nullable().default(null),
});
export const feedbackInput = z.object({ text: z.string().trim().min(4).max(1000) });
export const answerInput = z.object({
  key: z.string().max(120),
  value: z.union([z.boolean(), z.number(), z.string().max(200)]),
  freeText: z.string().max(1000).optional(),
});
export const searchInput = z.object({
  q: z.string().max(300).default(""),
  mode: z.enum(["hybrid", "keyword", "semantic"]).default("hybrid"),
  limit: z.number().int().min(1).max(100).default(25),
});

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
