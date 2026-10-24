import { z } from "zod";
import { LIMITS } from "./limits.ts";

// Messages are shown to players as-is, so each names its field in plain words.

const email = z
  .email("Enter a valid email address.")
  .max(LIMITS.emailMaxLength, "That email address is too long.")
  .transform((value) => value.toLowerCase());

export const SignUpRequest = z.strictObject({
  email,
  password: z
    .string()
    .min(
      LIMITS.passwordMinLength,
      `Password must be at least ${LIMITS.passwordMinLength} characters.`,
    )
    .max(
      LIMITS.passwordMaxLength,
      `Password must be at most ${LIMITS.passwordMaxLength} characters.`,
    ),
  characterName: z
    .string()
    .trim()
    .min(
      LIMITS.characterNameMinLength,
      `Character name must be at least ${LIMITS.characterNameMinLength} characters.`,
    )
    .max(
      LIMITS.characterNameMaxLength,
      `Character name must be at most ${LIMITS.characterNameMaxLength} characters.`,
    )
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "Character name can only use letters, digits and underscores, and must start with a letter.",
    ),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

// Login only bounds the password length: rejecting a "too short" password here
// would tell an attacker something about the password policy for free.
export const LoginRequest = z.strictObject({
  email,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(
      LIMITS.passwordMaxLength,
      `Password must be at most ${LIMITS.passwordMaxLength} characters.`,
    ),
});
export type LoginRequest = z.infer<typeof LoginRequest>;
