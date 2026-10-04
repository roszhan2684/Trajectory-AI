export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "SETUP_REQUIRED"
  | "CONFLICT";

/** Typed domain error with a user-safe message (never a stack trace or secret). */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    public readonly userMessage: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = "DomainError";
  }
}

export const HTTP_STATUS: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  SETUP_REQUIRED: 503,
};
