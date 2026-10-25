import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, inventories, readDbEnv, runMigrations, storehouseItems } from "@nf/db";
import { type GameState, RESOURCE_NODES, STARTING_STOREHOUSE } from "@nf/shared";
import { eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

const store = STARTING_STOREHOUSE;
const tree = RESOURCE_NODES.heartland_tree;

// The game's clock, an hour ahead of real time so new characters may walk anywhere.
const clock = Date.now() + 60 * 60 * 1000;

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

async function newPlayer(carrying: Record<string, number> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `s-${id}@example.test`,
      password: "correct horse battery",
      characterName: `S${id}`,
    },
  });
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  const { player } = (await res.json()) as { player: { characterId: string } };
  for (const [itemId, quantity] of Object.entries(carrying)) {
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

/** A player standing west of the storehouse, facing it. */
async function playerAtStorehouse(carrying: Record<string, number> = {}) {
  const player = await newPlayer(carrying);
  expect((await act(player.cookie, "move.to", { x: store.x - 1, y: store.y })).status).toBe(200);
  expect((await act(player.cookie, "turn", { facing: "e" })).status).toBe(200);
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

describe("the storehouse", () => {
  it("starts empty", async () => {
    const { cookie } = await newPlayer();
    expect((await state(cookie)).storage[store.id]).toEqual({});
  });

  it("stores and takes items, and keeps them across reloads", async () => {
    const { cookie, characterId } = await playerAtStorehouse({ wood: 4 });
    const stored = await act(cookie, "storehouse.store", { item: "wood", quantity: 4 });
    expect(stored.status).toBe(200);
    const afterStore = await state(cookie);
    expect(afterStore.inventory).toEqual({});
    expect(afterStore.storage[store.id]).toEqual({ wood: 4 });
    const [row] = await db
      .select()
      .from(storehouseItems)
      .where(eq(storehouseItems.characterId, characterId));
    expect(row).toMatchObject({ buildingId: store.id, itemId: "wood", quantity: 4 });

    expect((await act(cookie, "storehouse.take", { item: "wood", quantity: 1 })).status).toBe(200);
    const afterTake = await state(cookie);
    expect(afterTake.inventory).toEqual({ wood: 1 });
    expect(afterTake.storage[store.id]).toEqual({ wood: 3 });
  });

  it("only works next to the storehouse and facing it", async () => {
    const { cookie } = await playerAtStorehouse({ wood: 1 });
    await act(cookie, "turn", { facing: "w" });
    const res = await act(cookie, "storehouse.store", { item: "wood", quantity: 1 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "not_at_storehouse" });
  });

  it("refuses to store more than carried, or to take past 5 in hand", async () => {
    const { cookie, characterId } = await playerAtStorehouse({ stone: 4 });
    const tooMany = await act(cookie, "storehouse.store", { item: "stone", quantity: 5 });
    expect(await tooMany.json()).toEqual({ error: "not_enough_items" });

    await db.insert(storehouseItems).values({ characterId, itemId: "stone", quantity: 10 });
    const overflow = await act(cookie, "storehouse.take", { item: "stone", quantity: 2 });
    expect(overflow.status).toBe(422);
    expect(await overflow.json()).toEqual({ error: "hands_full" });
  });

  it("holds at most 100 of each item", async () => {
    const { cookie, characterId } = await playerAtStorehouse({ wood: 2 });
    await db.insert(storehouseItems).values({ characterId, itemId: "wood", quantity: 99 });
    const res = await act(cookie, "storehouse.store", { item: "wood", quantity: 2 });
    expect(await res.json()).toEqual({ error: "storehouse_full" });
    expect((await act(cookie, "storehouse.store", { item: "wood", quantity: 1 })).status).toBe(200);
    expect((await state(cookie)).storage[store.id]).toEqual({ wood: 100 });
  });
});

describe("carry limit", () => {
  it("stops gathering at 5 in hand", async () => {
    const { cookie } = await newPlayer({ wood: 5 });
    await act(cookie, "move.to", { x: tree.x + 1, y: tree.y });
    await act(cookie, "turn", { facing: "w" });
    const res = await act(cookie, "gather.start", { nodeId: "heartland_tree" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "hands_full" });
  });
});
