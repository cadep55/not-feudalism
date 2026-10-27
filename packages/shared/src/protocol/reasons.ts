/**
 * Every reason the server may give for refusing a request. The client maps
 * these to friendly messages, so add new ones here rather than sending free text.
 */
export const FAILURE_REASONS = [
  "invalid_input",
  "invalid_credentials",
  "account_banned",
  "email_taken",
  "name_taken",
  "not_authenticated",
  "rate_limited",
  "out_of_bounds",
  "moved_too_fast",
  "water",
  "too_far_away",
  "not_facing",
  "busy",
  "missing_tool",
  "missing_materials",
  "hands_full",
  "not_at_storehouse",
  "not_enough_items",
  "storehouse_full",
  "no_field",
  "field_growing",
  "no_seeds",
  "cannot_plant_here",
  "no_villager",
  "no_rake_in_storehouse",
  "building_limit",
  "cannot_build_here",
  "no_building",
  "last_building",
  "storehouse_not_empty",
  "no_room_for_refund",
  "protocol_mismatch",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value);
}
