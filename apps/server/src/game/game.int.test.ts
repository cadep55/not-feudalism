import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, gameActions, readDbEnv, runMigrations } from "@nf/db";
import { type GameState, REGIONS, SPAWN_POINT } from "@nf/shared";
import { eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

type Call = (path: string, options?: { body?: unknown; cookie?: string }) => Promise<Response>;

async function startApp(actionsPerMinute = 1_000): Promise<Call> {
  const app = express();
  configureHttp(app, {
    clientOrigin: "http://localhost:5173",
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    auth: { db, secureCookies: false, rateLimitPerWindow: 1_000 },
    game: { db, actionsPerMinute },
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return (path, options = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: options.body ? "POST" : "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
}

/** Signs up a fresh player and returns their session cookie and character id. */
async function newPlayer(call: Call): Promise<{ cookie: string; characterId: string }> {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `g-${id}@example.test`,
      password: "correct horse battery",
      characterName: `G${id}`,
    },
  });
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  const { player } = (await res.json()) as { player: { characterId: string } };
  return { cookie, characterId: player.characterId };
}

const move = (x: number, y: number, requestId: string = randomUUID()) => ({
  requestId,
  type: "move.to",
  payload: { x, y },
});

async function stateOf(res: Response): Promise<GameState> {
  return ((await res.json()) as { state: GameState }).state;
}

let call: Call;

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("GET /game/state", () => {
  it("needs a session", async () => {
    const res = await call("/game/state");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not_authenticated" });
  });

  it("returns a new character at the spawn point", async () => {
    const { cookie, characterId } = await newPlayer(call);
    const res = await call("/game/state", { cookie });
    expect(res.status).toBe(200);
    expect((await stateOf(res)).character).toMatchObject({
      id: characterId,
      rank: "peasant",
      gold: 0,
      region: "heartland",
      ...SPAWN_POINT,
    });
  });
});

describe("POST /game/actions", () => {
  it("needs a session", async () => {
    expect((await call("/game/actions", { body: move(1, 1) })).status).toBe(401);
  });

  it("applies a move, returns the new state and saves it", async () => {
    const { cookie } = await newPlayer(call);
    const res = await call("/game/actions", { cookie, body: move(3, 4) });
    expect(res.status).toBe(200);
    expect((await stateOf(res)).character).toMatchObject({ x: 3, y: 4 });

    const reloaded = await stateOf(await call("/game/state", { cookie }));
    expect(reloaded.character).toMatchObject({ x: 3, y: 4 });
  });

  it("rejects malformed and unknown actions", async () => {
    const { cookie } = await newPlayer(call);
    for (const body of [
      { requestId: randomUUID(), type: "gold.grant", payload: { amount: 1_000_000 } },
      { requestId: randomUUID(), type: "move.to", payload: { x: "1", y: 2 } },
      { type: "move.to", payload: { x: 1, y: 2 } },
    ]) {
      const res = await call("/game/actions", { cookie, body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
    }
  });

  it("refuses moves off the map and leaves the character where it was", async () => {
    const { cookie } = await newPlayer(call);
    const res = await call("/game/actions", {
      cookie,
      body: move(REGIONS.heartland.width, 0),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "out_of_bounds" });
    expect((await stateOf(await call("/game/state", { cookie }))).character).toMatchObject(
      SPAWN_POINT,
    );
  });

  it("applies a repeated requestId only once and replays the original result", async () => {
    const { cookie, characterId } = await newPlayer(call);
    const first = move(1, 1);
    await call("/game/actions", { cookie, body: first });
    await call("/game/actions", { cookie, body: move(2, 2) });

    // A late retry of the first request must not walk the character back to (1, 1).
    const retry = await call("/game/actions", { cookie, body: first });
    expect(retry.status).toBe(200);
    expect((await stateOf(retry)).character).toMatchObject({ x: 1, y: 1 });
    expect((await stateOf(await call("/game/state", { cookie }))).character).toMatchObject({
      x: 2,
      y: 2,
    });

    const logged = await db
      .select()
      .from(gameActions)
      .where(eq(gameActions.characterId, characterId));
    expect(logged).toHaveLength(2);
  });

  it("handles the same requestId sent twice at the same moment", async () => {
    const { cookie, characterId } = await newPlayer(call);
    const body = move(7, 7);
    const [a, b] = await Promise.all([
      call("/game/actions", { cookie, body }),
      call("/game/actions", { cookie, body }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const logged = await db
      .select()
      .from(gameActions)
      .where(eq(gameActions.characterId, characterId));
    expect(logged).toHaveLength(1);
  });

  it("replays failures too, so a retry can't sneak through", async () => {
    const { cookie } = await newPlayer(call);
    const offMap = move(9_000, 0);
    expect((await call("/game/actions", { cookie, body: offMap })).status).toBe(422);
    expect((await call("/game/actions", { cookie, body: offMap })).status).toBe(422);
  });

  it("keeps request ids separate per character", async () => {
    const alice = await newPlayer(call);
    const bob = await newPlayer(call);
    const requestId = randomUUID();
    await call("/game/actions", { cookie: alice.cookie, body: move(1, 1, requestId) });
    const res = await call("/game/actions", { cookie: bob.cookie, body: move(5, 5, requestId) });
    expect((await stateOf(res)).character).toMatchObject({ x: 5, y: 5 });
  });

  it("rate-limits actions per account", async () => {
    const limited = await startApp(2);
    const { cookie } = await newPlayer(limited);
    expect((await limited("/game/actions", { cookie, body: move(1, 1) })).status).toBe(200);
    expect((await limited("/game/actions", { cookie, body: move(1, 2) })).status).toBe(200);
    const blocked = await limited("/game/actions", { cookie, body: move(1, 3) });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });

    // Another account on the same network still has its own budget.
    const other = await newPlayer(limited);
    expect(
      (await limited("/game/actions", { cookie: other.cookie, body: move(1, 1) })).status,
    ).toBe(200);
  });
});
