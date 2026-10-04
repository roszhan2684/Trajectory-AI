/** Introduction state machine (spec §42). Invalid transitions are rejected, not coerced. */
import type { IntroStatus } from "../types";
import { DomainError } from "../errors";

export const INTRO_TRANSITIONS: Record<IntroStatus, IntroStatus[]> = {
  DRAFT: ["AWAITING_CANDIDATE", "CANCELLED"],
  AWAITING_CANDIDATE: ["READY_FOR_APPROVAL", "DECLINED", "CANCELLED"],
  READY_FOR_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: [],
  DECLINED: [],
  CANCELLED: [],
};

export const INTRO_LABELS: Record<IntroStatus, string> = {
  DRAFT: "Draft",
  AWAITING_CANDIDATE: "Awaiting candidate",
  READY_FOR_APPROVAL: "Ready for approval",
  APPROVED: "Approved",
  SENT: "Sent",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export function canTransition(from: IntroStatus, to: IntroStatus): boolean {
  return INTRO_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: IntroStatus, to: IntroStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "INVALID_STATE",
      `An introduction can't move from ${INTRO_LABELS[from]} to ${INTRO_LABELS[to]}.`,
      { from, to },
    );
  }
}
