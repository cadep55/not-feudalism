import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { afterAll, describe, expect, it } from "vitest";
import { readServerEnv } from "./env.ts";
import { startServer } from "./server.ts";

// Its own file: a failed start leaves Colyseus's process-wide state behind,
// and Vitest gives each test file a fresh module graph.

let blocker: Server | undefined;

afterAll(() => {
  blocker?.close();
});

describe("game server startup", () => {
  it("fails fast instead of hanging when the port is taken", async () => {
    const occupied = createServer();
    blocker = occupied;
    await new Promise<void>((resolve) => occupied.listen(0, resolve));
    const { port } = occupied.address() as AddressInfo;

    const env = readServerEnv({
      ...process.env,
      PORT: String(port),
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    });

    await expect(startServer(env, pino({ level: "silent" }))).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  }, 10_000);
});
