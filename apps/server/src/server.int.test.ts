import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readServerEnv } from "./env.ts";
import { type RunningServer, startServer } from "./server.ts";

let server: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  const env = readServerEnv({
    ...process.env,
    PORT: "0",
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  });
  server = await startServer(env, pino({ level: "silent" }));
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server?.stop();
});

describe("game server", () => {
  it("serves health and readiness against the real database", async () => {
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
    const ready = await fetch(`${baseUrl}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
  });

  it("stops cleanly and releases the port", async () => {
    await server.stop();
    await expect(fetch(`${baseUrl}/healthz`)).rejects.toThrow();
    // Prevent afterAll from stopping twice.
    server = { port: server.port, stop: async () => {} };
  });
});
