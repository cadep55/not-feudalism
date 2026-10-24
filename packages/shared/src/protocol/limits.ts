/**
 * Input limits enforced by the protocol schemas. These protect the server
 * (no megabyte chat messages, no slow-to-hash huge passwords); they are not
 * game balance, which lives in src/data/.
 */
export const LIMITS = {
  emailMaxLength: 254,
  passwordMinLength: 10,
  // argon2 hashing cost grows with input; cap it so login can't be used to burn CPU.
  passwordMaxLength: 128,
  // TODO(design): confirm character name rules (length, allowed characters).
  characterNameMinLength: 3,
  characterNameMaxLength: 16,
  chatMaxLength: 200,
  // Generous upper bound for map coordinates; each region's real bounds are checked in its room.
  maxCoordinate: 10_000,
} as const;
