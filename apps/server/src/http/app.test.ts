import type { AddressInfo } from "node:net";
import { PROTOCOL_VERSION } from "@nf/shared";
import express from "express";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { configureHttp, type HttpDeps } from "./app.ts";

const CLIENT_ORIGIN = "http://localhost:5173";
const servers: { close: () => void }[] = [];

async function startApp(overrides: Partial<HttpDeps> = {}) {
  const app = express();
  configureHttp(app, {
    clientOrigin: CLIENT_ORIGIN,
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    ...overrides,
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("health routes", () => {
  it("reports the process is up", async () => {
    const get = await startApp();
    const res = await get("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("reports ready when the database answers", async () => {
    const get = await startApp();
    const res = await get("/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("reports unavailable when the database check fails", async () => {
    const get = await startApp({
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await get("/readyz");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
  });
});

describe("version route", () => {
  it("reports the protocol version for the client's compatibility check", async () => {
    const get = await startApp();
    const res = await get("/version");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ protocol: PROTOCOL_VERSION });
  });
});

describe("security middleware", () => {
  it("allows the client origin with credentials", async () => {
    const get = await startApp();
    const res = await get("/healthz", { headers: { Origin: CLIENT_ORIGIN } });
    expect(res.headers.get("access-control-allow-origin")).toBe(CLIENT_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not allow other origins", async () => {
    const get = await startApp();
    const res = await get("/healthz", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sets security headers and hides the framework", async () => {
    const get = await startApp();
    const res = await get("/healthz");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("rejects JSON bodies over 16 KB", async () => {
    const get = await startApp();
    const res = await get("/healthz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(20_000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
  });

  it("rejects malformed JSON as a bad request, not a server error", async () => {
    const get = await startApp();
    const res = await get("/healthz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });
});
