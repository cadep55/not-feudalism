/**
 * Every reason the server may give for refusing a request. The client maps
 * these to friendly messages, so add new ones here rather than sending free text.
 */
export const FAILURE_REASONS = [
  "invalid_input",
  "invalid_credentials",
  "email_taken",
  "name_taken",
  "not_authenticated",
  "rate_limited",
  "protocol_mismatch",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value);
}
