import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, inventories, jobs, readDbEnv, runMigrations } from "@nf/db";
import { GATHER_DURATION_MS, type GameState, RESOURCE_NODES } from "@nf/shared";
import { eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

const tree = RESOURCE_NODES.heartland_tree;

// The game's clock, an hour ahead of real time so new characters may walk anywhere.
let clock = Date.now() + 60 * 60 * 1000;

type Call = (path: string, options?: { body?: unknown; cookie?: string }) => Promise<Response>;
let call: Call;

async function startApp(): Promise<Call> {
  const app = express();
  configureHttp(app, {
    clientOrigin: "http://localhost:5173",
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    auth: { db, secureCookies: false, rateLimitPerWindow: 1_000 },
    game: { db, actionsPerMinute: 1_000, now: () => new Date(clock) },
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

async function newPlayer(): Promise<{ cookie: string; characterId: string }> {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `h-${id}@example.test`,
      password: "correct horse battery",
      characterName: `H${id}`,
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

const action = (type: string, payload: unknown) => ({ requestId: randomUUID(), type, payload });

async function act(cookie: string, type: string, payload: unknown): Promise<Response> {
  return call("/game/actions", { cookie, body: action(type, payload) });
}

async function state(cookie: string): Promise<GameState> {
  return ((await (await call("/game/state", { cookie })).json()) as { state: GameState }).state;
}

/** A new player standing next to the tree. */
async function playerAtTree() {
  const player = await newPlayer();
  const res = await act(player.cookie, "move.to", { x: tree.x + 1, y: tree.y + 1 });
  expect(res.status).toBe(200);
  // Face the tree (north-west of us), as the client does before gathering.
  expect((await act(player.cookie, "turn", { facing: "nw" })).status).toBe(200);
  return player;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("gathering", () => {
  it("starts empty-handed and idle", async () => {
    const { cookie } = await newPlayer();
    const s = await state(cookie);
    expect(s.inventory).toEqual({});
    expect(s.job).toBeNull();
  });

  it("gathers wood: a 3-second job, then one wood in the inventory", async () => {
    const { cookie, characterId } = await playerAtTree();
    const started = await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    expect(started.status).toBe(200);
    const { state: running } = (await started.json()) as { state: GameState };
    expect(running.job).toMatchObject({
      nodeId: "heartland_tree",
      completesAt: clock + GATHER_DURATION_MS,
    });

    clock += GATHER_DURATION_MS - 1;
    expect((await state(cookie)).inventory).toEqual({});

    clock += 1;
    const done = await state(cookie);
    expect(done.inventory).toEqual({ wood: 1 });
    expect(done.job).toBeNull();

    const [row] = await db
      .select()
      .from(inventories)
      .where(eq(inventories.characterId, characterId));
    expect(row).toMatchObject({ itemId: "wood", quantity: 1 });
    const [job] = await db.select().from(jobs).where(eq(jobs.characterId, characterId));
    expect(job).toMatchObject({ outcome: "completed" });
  });

  it("finishes a gather while the player is away (resolved on the next read)", async () => {
    const { cookie } = await playerAtTree();
    await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    clock += 24 * 60 * 60 * 1000;
    expect((await state(cookie)).inventory).toEqual({ wood: 1 });
  });

  it("stacks up across gathers", async () => {
    const { cookie } = await playerAtTree();
    for (let i = 0; i < 3; i++) {
      expect((await act(cookie, "gather.start", { nodeId: "heartland_tree" })).status).toBe(200);
      clock += GATHER_DURATION_MS;
    }
    expect((await state(cookie)).inventory).toEqual({ wood: 3 });
  });

  it("refuses to gather when not facing the node, until the player turns", async () => {
    const { cookie } = await playerAtTree();
    await act(cookie, "turn", { facing: "se" });
    const refused = await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "not_facing" });

    expect((await act(cookie, "turn", { facing: "nw" })).status).toBe(200);
    expect((await act(cookie, "gather.start", { nodeId: "heartland_tree" })).status).toBe(200);
  });

  it("cancels the gather when the player turns away", async () => {
    const { cookie } = await playerAtTree();
    await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    await act(cookie, "turn", { facing: "e" });
    clock += 3_000;
    expect((await state(cookie)).inventory).toEqual({});
  });

  it("saves facing: moves set it and it survives a reload", async () => {
    const { cookie } = await newPlayer();
    expect((await state(cookie)).character.facing).toBe("s");
    await act(cookie, "move.to", { x: 11, y: 10 });
    expect((await state(cookie)).character.facing).toBe("e");
    await act(cookie, "turn", { facing: "n" });
    expect((await state(cookie)).character.facing).toBe("n");
  });

  it("sets aside a saved job it can't read instead of locking the player out", async () => {
    const { cookie, characterId } = await newPlayer();
    await db.insert(jobs).values({
      characterId,
      kind: "craft",
      payload: {},
      startedAt: new Date(clock),
      completesAt: new Date(clock + 3_000),
    });
    const res = await call("/game/state", { cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: GameState }).state.job).toBeNull();
    const [job] = await db.select().from(jobs).where(eq(jobs.characterId, characterId));
    expect(job).toMatchObject({ outcome: "invalid" });
  });

  it("refuses to gather from too far away", async () => {
    const { cookie } = await newPlayer();
    const res = await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "too_far_away" });
  });

  it("refuses a second gather while one is running", async () => {
    const { cookie } = await playerAtTree();
    await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    const res = await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "busy" });
  });

  it("cancels the gather when the player walks away", async () => {
    const { cookie, characterId } = await playerAtTree();
    await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    clock += 1_000;
    expect((await act(cookie, "move.to", { x: tree.x + 2, y: tree.y + 2 })).status).toBe(200);
    clock += GATHER_DURATION_MS;
    const s = await state(cookie);
    expect(s.inventory).toEqual({});
    expect(s.job).toBeNull();
    const [job] = await db.select().from(jobs).where(eq(jobs.characterId, characterId));
    expect(job).toMatchObject({ outcome: "cancelled" });
  });

  it("rejects unknown nodes", async () => {
    const { cookie } = await newPlayer();
    const res = await act(cookie, "gather.start", { nodeId: "heartland_gold_mine" });
    expect(res.status).toBe(400);
  });
});
