import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, inventories, jobs, readDbEnv, runMigrations } from "@nf/db";
import { type GameState, RECIPES, RESOURCE_NODES } from "@nf/shared";
import { eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

const CRAFT_MS = RECIPES.rake.durationMs;
const tree = RESOURCE_NODES.heartland_tree;
// The starting wheat field (STARTING_FIELDS).
const farm = { x: 13, y: 14, id: "heartland:13,14" };

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

/** A new player, optionally carrying some items (gathering is covered by gather tests). */
async function newPlayer(items: Record<string, number> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `k-${id}@example.test`,
      password: "correct horse battery",
      characterName: `K${id}`,
    },
  });
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  const { player } = (await res.json()) as { player: { characterId: string } };
  for (const [itemId, quantity] of Object.entries(items)) {
    await db.insert(inventories).values({ characterId: player.characterId, itemId, quantity });
  }
  return { cookie, characterId: player.characterId };
}

async function act(cookie: string, type: string, payload: unknown): Promise<Response> {
  return call("/game/actions", { cookie, body: { requestId: randomUUID(), type, payload } });
}

async function state(cookie: string): Promise<GameState> {
  return ((await (await call("/game/state", { cookie })).json()) as { state: GameState }).state;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("crafting the rake", () => {
  it("takes 2 wood + 1 stone at once, and gives a rake 3 seconds later", async () => {
    const { cookie, characterId } = await newPlayer({ wood: 3, stone: 1 });
    const res = await act(cookie, "craft.start", { recipeId: "rake" });
    expect(res.status).toBe(200);
    const { state: started } = (await res.json()) as { state: GameState };
    expect(started.inventory).toEqual({ wood: 1 });
    expect(started.job).toMatchObject({ kind: "craft", recipeId: "rake" });

    // The stone row is gone from the database, not just from the response.
    const rows = await db
      .select()
      .from(inventories)
      .where(eq(inventories.characterId, characterId));
    expect(rows.map((r) => [r.itemId, r.quantity])).toEqual([["wood", 1]]);

    clock += CRAFT_MS;
    expect((await state(cookie)).inventory).toEqual({ wood: 1, rake: 1 });
    const [job] = await db.select().from(jobs).where(eq(jobs.characterId, characterId));
    expect(job).toMatchObject({ kind: "craft", outcome: "completed" });
  });

  it("keeps crafting while the player walks", async () => {
    const { cookie } = await newPlayer({ wood: 2, stone: 1 });
    await act(cookie, "craft.start", { recipeId: "rake" });
    expect((await act(cookie, "move.to", { x: 11, y: 11 })).status).toBe(200);
    clock += CRAFT_MS;
    expect((await state(cookie)).inventory).toEqual({ rake: 1 });
  });

  it("refuses without the materials, and takes nothing", async () => {
    const { cookie } = await newPlayer({ wood: 2 });
    const res = await act(cookie, "craft.start", { recipeId: "rake" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "missing_materials" });
    expect((await state(cookie)).inventory).toEqual({ wood: 2 });
  });

  it("refuses while gathering", async () => {
    const { cookie } = await newPlayer({ wood: 2, stone: 1 });
    await act(cookie, "move.to", { x: tree.x + 1, y: tree.y });
    // Face the node (west of us), as the client does before gathering.
    await act(cookie, "turn", { facing: "w" });
    await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    const res = await act(cookie, "craft.start", { recipeId: "rake" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "busy" });
  });

  it("rejects unknown recipes", async () => {
    const { cookie } = await newPlayer();
    expect((await act(cookie, "craft.start", { recipeId: "sword" })).status).toBe(400);
  });

  it("completes the loop: craft a rake, then harvest wheat", async () => {
    const { cookie } = await newPlayer({ wood: 2, stone: 1 });
    await act(cookie, "craft.start", { recipeId: "rake" });
    clock += CRAFT_MS;
    await act(cookie, "move.to", { x: farm.x + 1, y: farm.y });
    // Face the node (west of us), as the client does before gathering.
    await act(cookie, "turn", { facing: "w" });
    expect((await act(cookie, "field.harvest", { fieldId: farm.id })).status).toBe(200);
    clock += 3_000;
    expect((await state(cookie)).inventory).toEqual({ rake: 1, wheat: 1 });
  });
});
