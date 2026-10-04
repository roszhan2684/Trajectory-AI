/** Browser-safe subset (no model weights): types, labels, RBAC, state machine. */
export * from "./types";
export * from "./errors";
export { FEATURE_LABELS, DEFAULT_WEIGHTS, DEFAULT_RANKING, SCORE_VERSION } from "./scoring/config";
export { can, capabilitiesFor, ROLE_LABELS, CAPABILITY_MATRIX, type Capability } from "./policy/rbac";
export { INTRO_TRANSITIONS, INTRO_LABELS, canTransition } from "./policy/intro";
