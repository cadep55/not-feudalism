import type { FailureReason } from "@nf/shared";

/** Player-facing text for every failure the server can report. */
export const FAILURE_MESSAGES: Record<FailureReason | "network_error", string> = {
  invalid_input: "Please check the form and try again.",
  invalid_credentials: "That email and password don't match.",
  account_banned: "This account has been banned.",
  email_taken: "An account with that email already exists.",
  name_taken: "That character name is taken.",
  not_authenticated: "Please log in.",
  rate_limited: "Too many attempts. Please wait a few minutes.",
  out_of_bounds: "You can't go there.",
  moved_too_fast: "Slow down! You can't walk that fast.",
  too_far_away: "Get closer to gather.",
  not_facing: "Face it to gather.",
  busy: "You're busy with another job.",
  missing_materials: "You don't have the materials for that.",
  missing_tool: "You need a rake to harvest wheat.",
  protocol_mismatch: "A new version of the game is out. Please refresh the page.",
  network_error: "Can't reach the server. Is it running?",
};
