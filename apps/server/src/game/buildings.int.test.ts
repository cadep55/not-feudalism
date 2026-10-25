import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  buildings,
  createDb,
  inventories,
  jobs,
  readDbEnv,
  runMigrations,
  storehouseItems,
  villagers,
} from "@nf/db";
import {
  BUILD_DURATION_MS,
  type GameState,
  REMOVE_DURATION_MS,
  STARTING_STOREHOUSE,
} from "@nf/shared";
import { and, eq, isNull } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];
const store = STARTING_STOREHOUSE;
/** Open grass with room for a 2x2 building and its clear ring. */
const OPEN = { x: 20, y: 13 };

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

async function newPlayer(carrying: Record<string, number> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `b-${id}@example.test`,
      password: "correct horse battery",
      characterName: `B${id}`,
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

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("building", () => {
  it("a house costs 5 wood, takes 10 seconds, persists, and brings 3 villagers", async () => {
    const { cookie, characterId } = await newPlayer({ wood: 5 });
    const res = await act(cookie, "building.build", { kind: "house", ...OPEN });
    expect(res.status).toBe(200);
    const building = await state(cookie);
    expect(building.inventory).toEqual({});
    expect(building.job).toMatchObject({ kind: "build", building: { kind: "house", ...OPEN } });

    clock += BUILD_DURATION_MS;
    const built = await state(cookie);
    expect(built.job).toBeNull();
    const house = built.buildings.find((b) => b.x === OPEN.x && b.y === OPEN.y);
    expect(house).toMatchObject({ kind: "house", width: 2, height: 2 });
    expect(built.villagers.filter((v) => v.houseId === house?.id)).toHaveLength(3);

    const rows = await db.select().from(buildings).where(eq(buildings.characterId, characterId));
    expect(rows).toHaveLength(3);
    const people = await db.select().from(villagers).where(eq(villagers.characterId, characterId));
    expect(people).toHaveLength(6);
  });

  it("a storehouse costs 5 wood and 5 stone, and keeps its own stock", async () => {
    const { cookie } = await newPlayer({ wood: 5, stone: 5 });
    expect((await act(cookie, "building.build", { kind: "storehouse", ...OPEN })).status).toBe(200);
    clock += BUILD_DURATION_MS;
    const built = await state(cookie);
    const second = built.buildings.find((b) => b.kind === "storehouse" && b.id !== store.id);
    if (!second) throw new Error("no second storehouse");
    expect(built.storage).toEqual({ [store.id]: {}, [second.id]: {} });
  });

  it("refuses without materials or in a blocked spot", async () => {
    const { cookie } = await newPlayer({ wood: 4 });
    const poor = await act(cookie, "building.build", { kind: "house", ...OPEN });
    expect(poor.status).toBe(422);
    expect(await poor.json()).toEqual({ error: "missing_materials" });

    const rich = await newPlayer({ wood: 5 });
    const blocked = await act(rich.cookie, "building.build", { kind: "house", x: 17, y: 8 });
    expect(await blocked.json()).toEqual({ error: "cannot_build_here" });
    expect((await act(rich.cookie, "building.build", { kind: "castle", ...OPEN })).status).toBe(
      400,
    );
  });
});

describe("removing", () => {
  it("takes 5 seconds and refunds the cost; the last house can't go", async () => {
    const { cookie, characterId } = await newPlayer({ wood: 5 });
    await act(cookie, "building.build", { kind: "house", ...OPEN });
    clock += BUILD_DURATION_MS;
    const built = await state(cookie);
    const house = built.buildings.find((b) => b.x === OPEN.x && b.y === OPEN.y);
    if (!house) throw new Error("not built");

    expect((await act(cookie, "building.remove", { buildingId: house.id })).status).toBe(200);
    const removing = await state(cookie);
    expect(removing.inventory).toEqual({ wood: 5 });
    expect(removing.buildings.map((b) => b.id)).not.toContain(house.id);
    expect(removing.villagers).toHaveLength(3);
    expect(removing.job).toMatchObject({ kind: "remove", building: { id: house.id } });

    clock += REMOVE_DURATION_MS;
    expect((await state(cookie)).job).toBeNull();
    const [open] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.characterId, characterId), isNull(jobs.resolvedAt)));
    expect(open).toBeUndefined();

    const last = await act(cookie, "building.remove", { buildingId: "heartland_house" });
    expect(await last.json()).toEqual({ error: "last_building" });
  });

  it("refuses a storehouse that isn't empty", async () => {
    const { cookie, characterId } = await newPlayer({ wood: 5, stone: 5 });
    await act(cookie, "building.build", { kind: "storehouse", ...OPEN });
    clock += BUILD_DURATION_MS;
    const second = (await state(cookie)).buildings.find(
      (b) => b.kind === "storehouse" && b.id !== store.id,
    );
    if (!second) throw new Error("not built");
    await db
      .insert(storehouseItems)
      .values({ characterId, buildingId: second.id, itemId: "wood", quantity: 1 });
    const res = await act(cookie, "building.remove", { buildingId: second.id });
    expect(await res.json()).toEqual({ error: "storehouse_not_empty" });
  });
});
