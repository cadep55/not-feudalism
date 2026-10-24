import { z } from "zod";
import { LIMITS } from "./limits.ts";

const email = z
  .email()
  .max(LIMITS.emailMaxLength)
  .transform((value) => value.toLowerCase());

export const SignUpRequest = z.strictObject({
  email,
  password: z.string().min(LIMITS.passwordMinLength).max(LIMITS.passwordMaxLength),
  characterName: z
    .string()
    .trim()
    .min(LIMITS.characterNameMinLength)
    .max(LIMITS.characterNameMaxLength)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Letters, digits and underscores, starting with a letter"),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

// Login only bounds the password length: rejecting a "too short" password here
// would tell an attacker something about the password policy for free.
export const LoginRequest = z.strictObject({
  email,
  password: z.string().min(1).max(LIMITS.passwordMaxLength),
});
export type LoginRequest = z.infer<typeof LoginRequest>;
