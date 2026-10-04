/**
 * Core domain types for Trajectory AI.
 * These mirror the data model in the Product Build Document (§14). The demo backend stores
 * them in an in-memory repository; a Prisma/Postgres implementation would map 1:1.
 */

export type ID = string;
export type ISODate = string;

// ---------------------------------------------------------------- organizations & RBAC
export type MemberRole = "OWNER" | "ADMIN" | "RECRUITER" | "HIRING_MANAGER" | "VIEWER" | "INTERNAL_OPERATOR";

export interface User {
  id: ID;
  email: string;
  displayName: string;
  title: string;
  avatarColor: string;
  createdAt: ISODate;
}

export type CompanyStage = "pre-seed" | "seed" | "series-a" | "series-b" | "growth" | "public";

export interface Organization {
  id: ID;
  name: string;
  slug: string;
  website: string;
  sizeBand: string;
  stage: CompanyStage;
  industry: string;
  defaultTimezone: string;
  description: string;
  hiringManagersCanApproveIntros: boolean;
  createdAt: ISODate;
}

export interface OrganizationMember {
  id: ID;
  organizationId: ID;
  userId: ID;
  role: MemberRole;
  invitedByUserId: ID | null;
  joinedAt: ISODate;
}

export interface Invitation {
  id: ID;
  organizationId: ID;
  role: MemberRole;
  token: string;
  email: string | null;
  createdByUserId: ID;
  createdAt: ISODate;
  expiresAt: ISODate;
  acceptedByUserId: ID | null;
}

// ---------------------------------------------------------------- roles
export type RoleStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "CLOSED";
export type LocationMode = "ONSITE" | "HYBRID" | "REMOTE";
export type TriState = "YES" | "NO" | "UNKNOWN";
export type RequirementCategory =
  | "SKILL"
  | "EXPERIENCE"
  | "DOMAIN"
  | "EDUCATION"
  | "LOCATION"
  | "AUTHORIZATION"
  | "COMPENSATION"
  | "WORK_STYLE"
  | "OTHER";
export type Importance = "MUST" | "STRONG" | "NICE";

export interface RoleRequirement {
  id: ID;
  roleId: ID;
  category: RequirementCategory;
  label: string;
  normalizedKey: string;
  importance: Importance;
  weight: number;
  sourceText: string;
  confidence: number;
  isHardConstraint: boolean;
}

export type PreferenceSource = "EXPLICIT" | "FEEDBACK" | "SYSTEM_SUGGESTED";

export interface RolePreference {
  id: ID;
  roleId: ID;
  key: string;
  weightDelta: number;
  source: PreferenceSource;
  active: boolean;
  refinementId: ID | null;
  createdByUserId: ID | null;
  createdAt: ISODate;
}

export interface JobRole {
  id: ID;
  organizationId: ID;
  title: string;
  status: RoleStatus;
  descriptionRaw: string;
  descriptionNormalized: string;
  responsibilities: string[];
  locationMode: LocationMode;
  city: string | null;
  region: string | null;
  countryCode: string;
  minComp: number | null;
  maxComp: number | null;
  currency: string | null;
  visaSupport: TriState;
  employmentType: string;
  minYears: number | null;
  maxYears: number | null;
  companyStage: CompanyStage;
  teamSize: number | null;
  domain: string | null;
  scoringOverrides: Partial<Record<FeatureKey, number>> | null;
  parse: RoleParseMeta | null;
  createdByUserId: ID;
  activatedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface RoleParseMeta {
  parserVersion: string;
  fieldConfidence: Record<string, number>;
  fieldSources: Record<string, string>;
  ambiguities: Ambiguity[];
  protectedTraitWarnings: string[];
  injectionFlags: string[];
}

export interface Ambiguity {
  key: string;
  question: string;
  severity: "low" | "medium" | "high";
}

// ---------------------------------------------------------------- candidates
export type WorkAuthorization =
  "citizen" | "permanent_resident" | "work_visa" | "authorized" | "needs_sponsorship";
export type Availability = "immediate" | "2_weeks" | "1_month" | "3_months" | "not_looking";
export type WorkMode = "onsite" | "hybrid" | "remote";

export interface CandidateExperience {
  id: ID;
  candidateId: ID;
  company: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate | null;
  description: string;
  bullets: string[];
  companyStage: CompanyStage | null;
  companySizeBand: string | null;
  teamSize: number | null;
  seniority: number; // 1 (junior) .. 6 (exec)
  normalizedSkills: string[];
}

export interface CandidateProject {
  id: ID;
  candidateId: ID;
  name: string;
  description: string;
  url: string | null;
  startDate: ISODate | null;
  endDate: ISODate | null;
  solo: boolean;
  shipped: boolean;
}

export interface CandidateSkill {
  id: ID;
  candidateId: ID;
  skillKey: string;
  displayName: string;
  proficiency: "familiar" | "proficient" | "expert" | null;
  yearsEstimate: number | null;
  lastUsedAt: ISODate | null;
  confidence: number;
  inferred: boolean;
}

export interface CandidatePreferences {
  workModes: WorkMode[] | null; // modes the candidate accepts
  openToRelocate: boolean | null;
  desiredStages: CompanyStage[] | null;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  domains: string[] | null;
  wantsAiWork: boolean | null;
  updatedAt: ISODate;
  sources: Partial<Record<string, "RESUME" | "CONVERSATION" | "MANUAL" | "IMPORT">>;
}

export type SourceType = "RESUME" | "GITHUB" | "MANUAL" | "CONVERSATION" | "IMPORT";

export interface CandidateSource {
  id: ID;
  candidateId: ID;
  sourceType: SourceType;
  sourceUri: string | null;
  originalFilename: string | null;
  checksum: string | null;
  text: string | null;
  metadata: Record<string, unknown>;
  status: "PROCESSED" | "PROCESSING" | "FAILED";
  ingestedAt: ISODate;
}

export type EvidenceType =
  | "EXPERIENCE"
  | "PROJECT"
  | "REPOSITORY"
  | "COMMIT"
  | "RESUME_FRAGMENT"
  | "ANSWER"
  | "PROFILE_FIELD"
  | "OTHER";

export interface EvidenceNode {
  id: ID;
  candidateId: ID;
  sourceId: ID | null;
  type: EvidenceType;
  title: string;
  body: string;
  startOffset: number | null;
  endOffset: number | null;
  sourceLocator: string | null;
  observedAt: ISODate | null; // when the evidenced activity happened (for recency)
  confidence: number;
  verified: boolean;
  skills: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: ISODate;
}

export type ClaimStatus = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "CONFLICTED";

export interface EvidenceClaim {
  id: ID;
  candidateId: ID;
  claimType: "skill" | "experience" | "ownership" | "startup" | "preference" | "profile";
  claimKey: string;
  claimValue: string;
  confidence: number;
  status: ClaimStatus;
  inferred: boolean;
  generatedBy: string; // extractor + version
  generatedAt: ISODate;
}

export interface EvidenceClaimLink {
  claimId: ID;
  evidenceNodeId: ID;
  relation: "SUPPORTS" | "CONTRADICTS" | "CONTEXT";
  strength: number;
}

export interface Candidate {
  id: ID;
  fullName: string;
  headline: string;
  email: string;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  metro: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  yearsExperience: number | null;
  workAuthorization: WorkAuthorization | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  availability: Availability | null;
  profileCompleteness: number;
  synthetic: boolean;
  experiences: CandidateExperience[];
  projects: CandidateProject[];
  skills: CandidateSkill[];
  preferences: CandidatePreferences;
  sources: CandidateSource[];
  evidence: EvidenceNode[];
  claims: EvidenceClaim[];
  claimLinks: EvidenceClaimLink[];
  flags: CandidateFlag[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CandidateFlag {
  kind: "PROMPT_INJECTION" | "PROTECTED_ATTRIBUTE" | "CONFLICT";
  detail: string;
  sourceId: ID | null;
}

// ---------------------------------------------------------------- matching
export type FeatureKey =
  | "technical_skill_fit"
  | "relevant_experience_fit"
  | "startup_stage_fit"
  | "ownership_signal"
  | "ai_product_signal"
  | "career_trajectory_fit"
  | "candidate_preference_fit"
  | "location_fit"
  | "compensation_fit"
  | "availability_fit"
  | "evidence_confidence";

export type ConstraintStatus = "PASS" | "FAIL" | "UNKNOWN";
export type FeatureStatus = "known" | "partial" | "unknown";

export interface ScoreComponent {
  key: string;
  label: string;
  kind: "feature" | "preference";
  rawValue: number | string | null;
  normalizedValue: number; // 0..1
  weight: number;
  contribution: number; // share of deterministic score, 0..1 scale
  status: FeatureStatus;
  evidenceIds: ID[];
  explanation: string;
  missing: string[]; // what evidence would raise this component
}

export interface ConstraintCheck {
  key: "location" | "work_authorization" | "compensation" | "must_have";
  label: string;
  status: ConstraintStatus;
  detail: string;
  resolutionQuestion: string | null;
  /** Soft checks are reported but never gate the aggregate hard-constraint status. */
  soft: boolean;
}

export type MatchStatus =
  | "NEW"
  | "REVIEWED"
  | "SHORTLISTED"
  | "REJECTED"
  | "QUALIFYING"
  | "INTERESTED"
  | "INTRO_REQUESTED"
  | "INTRODUCED"
  | "CLOSED";

export interface MatchUncertainty {
  id: ID;
  key: string;
  severity: "low" | "medium" | "high";
  description: string;
  resolutionQuestion: string | null;
  answerKind: "yes_no" | "number" | "choice" | "text";
  choices: string[] | null;
  expectedImpact: number; // |Δ final score| if resolved favourably (deterministic simulation)
  resolvedAt: ISODate | null;
}

export interface RerankResult {
  relevance: number; // calibrated 0..1 (used in the blend)
  rawRelevance: number; // P(good) + 0.5·P(potential) straight from the model
  probabilities: [number, number, number]; // no fit / potential / good
  confidence: number;
  reasons: { text: string; evidenceIds: ID[]; impact: number }[];
  missingInformation: string[];
  recommendation: "advance" | "consider" | "pass";
  modelVersion: string;
}

export interface MatchExplanation {
  summary: string;
  whyMatch: { text: string; evidenceIds: ID[] }[];
  risks: { text: string; evidenceIds: ID[]; kind: "missing" | "negative" | "conflict" }[];
  whyNotHundred: WhyNotItem[];
  counterfactuals: Counterfactual[];
  generator: string;
  promptVersion: string;
  generatedAt: ISODate;
}

export interface WhyNotItem {
  key: string;
  label: string;
  pointsLost: number; // in 0..100 final-score points
  kind: "missing_evidence" | "negative_evidence" | "constraint_unknown" | "model_judgement" | "semantic";
  text: string;
}

export interface Counterfactual {
  key: string;
  scenario: string;
  componentDeltas: { key: string; label: string; delta: number }[];
  confidenceDelta: number;
  finalBefore: number;
  finalAfter: number;
}

export interface Match {
  id: ID;
  organizationId: ID;
  roleId: ID;
  candidateId: ID;
  retrievalScore: number | null;
  keywordScore: number | null;
  deterministicScore: number;
  semanticScore: number | null;
  rerankScore: number | null;
  finalScore: number;
  confidenceScore: number;
  hardConstraintStatus: ConstraintStatus;
  constraints: ConstraintCheck[];
  rank: number;
  previousRank: number | null;
  previousFinalScore: number | null;
  status: MatchStatus;
  scoreVersion: string;
  components: ScoreComponent[];
  uncertainties: MatchUncertainty[];
  rerank: RerankResult | null;
  explanation: MatchExplanation | null;
  generatedAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------- feedback / refinements
export type FeedbackType = "REJECT" | "BOOST" | "DOWNRANK" | "SHORTLIST" | "FREE_TEXT" | "PREFERENCE_UPDATE";

export interface RankingFeedback {
  id: ID;
  organizationId: ID;
  roleId: ID;
  candidateId: ID | null;
  matchId: ID | null;
  userId: ID;
  type: FeedbackType;
  reasonCode: string | null;
  freeText: string | null;
  parsedEffect: PreferenceProposal[] | null;
  createdAt: ISODate;
}

export interface PreferenceProposal {
  key: string;
  label: string;
  delta: number;
  confidence: number;
  matchedPhrase: string;
  rationale: string;
}

export interface RankingRefinement {
  id: ID;
  organizationId: ID;
  roleId: ID;
  feedbackId: ID;
  status: "PROPOSED" | "APPLIED" | "REVERTED" | "DISCARDED";
  proposals: PreferenceProposal[];
  unrecognized: string[];
  refused: string[];
  interpreterVersion: string;
  before: RankSnapshot[] | null;
  after: RankSnapshot[] | null;
  createdByUserId: ID;
  createdAt: ISODate;
  appliedAt: ISODate | null;
  revertedAt: ISODate | null;
}

export interface RankSnapshot {
  candidateId: ID;
  rank: number;
  finalScore: number;
  components: Record<string, number>;
}

// ---------------------------------------------------------------- conversations & intros
export interface Conversation {
  id: ID;
  organizationId: ID;
  candidateId: ID;
  roleId: ID | null;
  matchId: ID | null;
  channel: "WEB" | "DEMO" | "EMAIL" | "OTHER";
  status: "OPEN" | "AWAITING_CANDIDATE" | "RESOLVED" | "CLOSED";
  portalToken: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: ID;
  conversationId: ID;
  senderType: "SYSTEM" | "AGENT" | "CANDIDATE" | "RECRUITER";
  senderId: ID | null;
  content: string;
  structured: {
    kind: "question" | "answer" | "interest" | "note" | "score_update";
    uncertaintyKey?: string;
    answerKind?: MatchUncertainty["answerKind"];
    choices?: string[] | null;
    value?: string | number | boolean;
    scoreBefore?: number;
    scoreAfter?: number;
  } | null;
  createdAt: ISODate;
}

export type IntroStatus =
  "DRAFT" | "AWAITING_CANDIDATE" | "READY_FOR_APPROVAL" | "APPROVED" | "SENT" | "DECLINED" | "CANCELLED";

export interface Introduction {
  id: ID;
  organizationId: ID;
  roleId: ID;
  candidateId: ID;
  matchId: ID;
  requestedByUserId: ID;
  status: IntroStatus;
  recruiterNote: string | null;
  draft: string | null;
  draftEvidenceIds: ID[];
  candidateConsentAt: ISODate | null;
  approvedByUserId: ID | null;
  approvedAt: ISODate | null;
  sentAt: ISODate | null;
  deliveryChannel: "demo_internal" | "email";
  history: { status: IntroStatus; at: ISODate; byUserId: ID | null; note: string | null }[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------- evals
export interface EvalDataset {
  id: ID;
  name: string;
  description: string;
  version: string;
  createdAt: ISODate;
}

export interface EvalCase {
  id: ID;
  datasetId: ID;
  roleId: ID;
  candidateId: ID;
  expectedRelevance: number; // 0..3
  labels: string[];
  notes: string | null;
}

export interface EvalMetrics {
  precisionAt5: number;
  recallAt10: number;
  ndcgAt10: number;
  mrr: number;
  hardConstraintViolationRate: number;
  citationValidity: number;
  structuredOutputSuccess: number;
  hallucinatedEvidenceRate: number;
  avgLatencyMs: number;
  estimatedCostUsd: number;
  roles: number;
  cases: number;
  perRole: { roleId: ID; title: string; ndcgAt10: number; precisionAt5: number }[];
}

export interface EvalRun {
  id: ID;
  datasetId: ID;
  name: string;
  codeVersion: string;
  scoringVersion: string;
  promptVersion: string;
  modelConfig: RankingConfig;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: ISODate;
  completedAt: ISODate | null;
  metrics: EvalMetrics | null;
  createdByUserId: ID | null;
}

export interface RankingConfig {
  label: string;
  useKeyword: boolean;
  useDeterministic: boolean;
  useSemantic: boolean;
  useReranker: boolean;
  blend: { deterministic: number; semantic: number; rerank: number };
}

// ---------------------------------------------------------------- ops: jobs, traces, audit, analytics
export type JobType =
  | "ingest-candidate-source"
  | "index-candidate"
  | "generate-role-matches"
  | "recompute-role-ranking"
  | "qualify-candidate"
  | "run-eval-suite"
  | "reconcile-search-index";

export interface JobStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  detail: string | null;
}

export interface JobRun {
  id: ID;
  organizationId: ID | null;
  type: JobType;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "RETRYING";
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  steps: JobStep[];
  error: { kind: "transient" | "permanent"; message: string } | null;
  result: Record<string, unknown> | null;
  traceId: string | null;
  createdByUserId: ID | null;
  createdAt: ISODate;
  startedAt: ISODate | null;
  completedAt: ISODate | null;
}

export interface TraceSpan {
  id: ID;
  parentId: ID | null;
  name: string;
  kind: "trace" | "span" | "generation";
  startMs: number;
  endMs: number;
  metadata: Record<string, string | number | boolean | null>;
}

export interface Trace {
  id: ID;
  name: string;
  orgHash: string | null;
  createdAt: ISODate;
  durationMs: number;
  metadata: Record<string, string | number | boolean | null>;
  spans: TraceSpan[];
}

export interface AuditEvent {
  id: ID;
  organizationId: ID | null;
  actorUserId: ID | null;
  action: string;
  entityType: string;
  entityId: ID;
  metadata: Record<string, unknown>;
  createdAt: ISODate;
}

export interface AnalyticsEvent {
  id: ID;
  name: string;
  orgHash: string | null;
  properties: Record<string, string | number | boolean | null>;
  createdAt: ISODate;
}

export interface SearchIndexState {
  entityType: "candidate";
  entityId: ID;
  contentHash: string;
  indexedHash: string | null;
  indexedAt: ISODate | null;
  status: "INDEXED" | "STALE" | "MISSING" | "ERROR";
  lastError: string | null;
}
