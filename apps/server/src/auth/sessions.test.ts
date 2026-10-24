import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  newSessionToken,
  SESSION_COOKIE,
  sessionTokenFromCookieHeader,
} from "./sessions.ts";

describe("session tokens", () => {
  it("are long, URL-safe and unique", () => {
    const a = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(a);
  });

  it("hash deterministically to hex, never equal to the token", () => {
    const token = newSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toBe(token);
  });
});

describe("sessionTokenFromCookieHeader", () => {
  it("finds the session cookie among others", () => {
    expect(sessionTokenFromCookieHeader(`theme=dark; ${SESSION_COOKIE}=abc123; x=1`)).toBe(
      "abc123",
    );
  });

  it("returns undefined when absent or empty", () => {
    expect(sessionTokenFromCookieHeader(undefined)).toBeUndefined();
    expect(sessionTokenFromCookieHeader("theme=dark")).toBeUndefined();
    expect(sessionTokenFromCookieHeader(`${SESSION_COOKIE}=`)).toBeUndefined();
  });
});
