import { describe, expect, it } from "vitest";
import { readDbEnv } from "./env.ts";

describe("readDbEnv", () => {
  it("accepts a postgres URL", () => {
    const url = "postgres://nf:pw@localhost:5432/not_feudalism";
    expect(readDbEnv({ DATABASE_URL: url })).toEqual({ DATABASE_URL: url });
  });

  it("rejects a missing DATABASE_URL with setup instructions", () => {
    expect(() => readDbEnv({})).toThrow(/Copy \.env\.example to \.env/);
  });

  it("rejects a non-postgres URL", () => {
    expect(() => readDbEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });
});
