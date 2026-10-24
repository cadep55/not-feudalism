import type { FailureReason } from "@nf/shared";
import type { Response } from "express";

/** HTTP status for every failure reason. Adding a reason in @nf/shared forces a choice here. */
const STATUS: Record<FailureReason, number> = {
  invalid_input: 400,
  invalid_credentials: 401,
  not_authenticated: 401,
  account_banned: 403,
  email_taken: 409,
  name_taken: 409,
  out_of_bounds: 422,
  moved_too_fast: 422,
  too_far_away: 422,
  busy: 409,
  missing_tool: 422,
  missing_materials: 422,
  rate_limited: 429,
  protocol_mismatch: 426,
};

/** Sends `{ error: reason }` with the matching status. */
export function sendFailure(res: Response, reason: FailureReason): void {
  res.status(STATUS[reason]).json({ error: reason });
}
