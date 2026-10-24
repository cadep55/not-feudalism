import { describe, expect, it } from "vitest";
import { readServerEnv } from "./env.ts";

const valid = {
  DATABASE_URL: "postgres://nf:pw@localhost:5432/not_feudalism",
  CLIENT_ORIGIN: "http://localhost:5173",
};

describe("readServerEnv", () => {
  it("applies defaults for NODE_ENV and PORT", () => {
    expect(readServerEnv(valid)).toEqual({ ...valid, NODE_ENV: "development", PORT: 2567 });
  });

  it("parses PORT from a string", () => {
    expect(readServerEnv({ ...valid, PORT: "3000" }).PORT).toBe(3000);
  });

  it("rejects missing settings with setup instructions", () => {
    expect(() => readServerEnv({})).toThrow(/Copy \.env\.example to \.env/);
  });

  it("rejects an out-of-range PORT", () => {
    expect(() => readServerEnv({ ...valid, PORT: "70000" })).toThrow(/PORT/);
  });
});
