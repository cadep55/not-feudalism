import { describe, expect, it } from "vitest";
import { LoginRequest, SignUpRequest } from "./auth.ts";
import { LIMITS } from "./limits.ts";

const validSignUp = {
  email: "Alice@Example.test",
  password: "correct horse battery",
  characterName: "Alice_1",
};

describe("SignUpRequest", () => {
  it("accepts a valid request and lower-cases the email", () => {
    expect(SignUpRequest.parse(validSignUp)).toEqual({
      ...validSignUp,
      email: "alice@example.test",
    });
  });

  it("trims the character name", () => {
    expect(SignUpRequest.parse({ ...validSignUp, characterName: "  Bob  " }).characterName).toBe(
      "Bob",
    );
  });

  it.each([
    ["not an email", { email: "alice" }],
    ["too-long email", { email: `${"a".repeat(250)}@x.test` }],
    ["short password", { password: "a".repeat(LIMITS.passwordMinLength - 1) }],
    ["huge password", { password: "a".repeat(LIMITS.passwordMaxLength + 1) }],
    ["short name", { characterName: "Al" }],
    ["long name", { characterName: "A".repeat(LIMITS.characterNameMaxLength + 1) }],
    ["name starting with a digit", { characterName: "1Alice" }],
    ["name with spaces inside", { characterName: "Sir Alice" }],
    ["name with markup", { characterName: "<b>Alice" }],
    ["wrong types", { email: 42, password: null }],
  ])("rejects %s", (_label, override) => {
    expect(SignUpRequest.safeParse({ ...validSignUp, ...override }).success).toBe(false);
  });

  it("rejects unknown fields so clients can't sneak in extra data", () => {
    expect(SignUpRequest.safeParse({ ...validSignUp, gold: 1_000_000 }).success).toBe(false);
  });
});

describe("LoginRequest", () => {
  it("accepts any non-empty password up to the limit", () => {
    expect(LoginRequest.parse({ email: "a@b.test", password: "x" })).toEqual({
      email: "a@b.test",
      password: "x",
    });
  });

  it("rejects an empty or huge password", () => {
    expect(LoginRequest.safeParse({ email: "a@b.test", password: "" }).success).toBe(false);
    expect(
      LoginRequest.safeParse({
        email: "a@b.test",
        password: "x".repeat(LIMITS.passwordMaxLength + 1),
      }).success,
    ).toBe(false);
  });
});
