/**
 * Demo backend schema. One in-memory document store persisted to .data/store.json.
 * Tables mirror the Product Build Document's Prisma models; repositories in services/ are the
 * only code that touches it, so swapping to Prisma/Postgres means re-implementing those.
 */
import type {
  AnalyticsEvent,
  AuditEvent,
  Candidate,
  Conversation,
  EvalCase,
  EvalDataset,
  EvalRun,
  Introduction,
  Invitation,
  JobRole,
  JobRun,
  Match,
  Organization,
  OrganizationMember,
  RankingFeedback,
  RankingRefinement,
  RolePreference,
  RoleRequirement,
  SearchIndexState,
  Trace,
  User,
} from "@trajectory/engine";

export interface ApiKey {
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MatchRun {
  id: string;
  organizationId: string;
  roleId: string;
  jobId: string | null;
  trigger: "seed" | "manual" | "refinement" | "qualification" | "revert";
  scoreVersion: string;
  configLabel: string;
  retrieved: number;
  ranked: number;
  filtered: number;
  startedAt: string;
  completedAt: string;
  traceId: string | null;
}

/** Latent generator attributes kept ONLY for eval labelling — never read by the ranker. */
export interface SyntheticLatent {
  candidateId: string;
  archetype: string;
  seniority: number;
  indie: boolean;
  enterprise: boolean;
  labels: Record<string, number>; // explicit labels for handcrafted candidates (roleKey -> 0..3)
}

export interface DB {
  schemaVersion: number;
  seededAt: string;
  seed: number;
  users: User[];
  organizations: Organization[];
  members: OrganizationMember[];
  invitations: Invitation[];
  apiKeys: ApiKey[];
  roles: JobRole[];
  requirements: RoleRequirement[];
  rolePreferences: RolePreference[];
  roleKeys: Record<string, string>; // stable seed key -> role id
  candidates: Candidate[];
  latent: SyntheticLatent[];
  matches: Match[];
  matchRuns: MatchRun[];
  feedback: RankingFeedback[];
  refinements: RankingRefinement[];
  conversations: Conversation[];
  introductions: Introduction[];
  evalDatasets: EvalDataset[];
  evalCases: EvalCase[];
  evalRuns: EvalRun[];
  jobs: JobRun[];
  traces: Trace[];
  audit: AuditEvent[];
  analytics: AnalyticsEvent[];
  indexState: SearchIndexState[];
  counters: Record<string, number>;
}

export const SCHEMA_VERSION = 3;

export function emptyDB(seed: number): DB {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: new Date().toISOString(),
    seed,
    users: [],
    organizations: [],
    members: [],
    invitations: [],
    apiKeys: [],
    roles: [],
    requirements: [],
    rolePreferences: [],
    roleKeys: {},
    candidates: [],
    latent: [],
    matches: [],
    matchRuns: [],
    feedback: [],
    refinements: [],
    conversations: [],
    introductions: [],
    evalDatasets: [],
    evalCases: [],
    evalRuns: [],
    jobs: [],
    traces: [],
    audit: [],
    analytics: [],
    indexState: [],
    counters: {},
  };
}
