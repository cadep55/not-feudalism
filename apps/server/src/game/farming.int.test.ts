import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, fields, inventories, readDbEnv, runMigrations } from "@nf/db";
import { FIELD_GROW_MS, FIELD_WHEAT, type GameState, HARVEST_DURATION_MS } from "@nf/shared";
import { and, eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

// The starting field (STARTING_FIELDS) and a spot east of it, facing west into it.
const FARM = { id: "heartland:13,14", x: 13, y: 14 };
const BESIDE_FARM = { x: 14, y: 14 };

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
      email: `f-${id}@example.test`,
      password: "correct horse battery",
      characterName: `F${id}`,
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

async function playerAtFarm(carrying: Record<string, number> = { rake: 1 }) {
  const player = await newPlayer(carrying);
  await act(player.cookie, "move.to", BESIDE_FARM);
  await act(player.cookie, "turn", { facing: "w" });
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

describe("wheat fields", () => {
  it("every new character starts with a grown field", async () => {
    const { cookie } = await newPlayer();
    expect((await state(cookie)).fields).toEqual([
      {
        id: FARM.id,
        region: "heartland",
        x: FARM.x,
        y: FARM.y,
        wheat: 50,
        seeds: 5,
        harvests: 0,
        readyAt: 0,
      },
    ]);
  });

  it("harvesting needs a rake, gives wheat, and uses up the field", async () => {
    const noRake = await playerAtFarm({});
    const refused = await act(noRake.cookie, "field.harvest", { fieldId: FARM.id });
    expect(await refused.json()).toEqual({ error: "missing_tool" });

    const { cookie } = await playerAtFarm();
    expect((await act(cookie, "field.harvest", { fieldId: FARM.id })).status).toBe(200);
    clock += HARVEST_DURATION_MS;
    const after = await state(cookie);
    expect(after.inventory).toEqual({ rake: 1, wheat: 1 });
    expect(after.fields[0]).toMatchObject({ wheat: FIELD_WHEAT - 1, harvests: 1 });
  });

  it("drops a seed on the 10th harvest", async () => {
    const { cookie, characterId } = await playerAtFarm();
    await db
      .update(fields)
      .set({ harvests: 9, wheat: 41 })
      .where(and(eq(fields.characterId, characterId), eq(fields.fieldId, FARM.id)));
    await act(cookie, "field.harvest", { fieldId: FARM.id });
    clock += HARVEST_DURATION_MS;
    const after = await state(cookie);
    expect(after.inventory).toEqual({ rake: 1, wheat: 1, wheat_seeds: 1 });
    expect(after.fields[0]).toMatchObject({ seeds: 4, harvests: 10 });
  });

  it("removes a field when its last wheat is harvested", async () => {
    const { cookie, characterId } = await playerAtFarm();
    await db
      .update(fields)
      .set({ wheat: 1, seeds: 0, harvests: 49 })
      .where(and(eq(fields.characterId, characterId), eq(fields.fieldId, FARM.id)));
    await act(cookie, "field.harvest", { fieldId: FARM.id });
    clock += HARVEST_DURATION_MS;
    expect((await state(cookie)).fields).toEqual([]);
    const rows = await db.select().from(fields).where(eq(fields.characterId, characterId));
    expect(rows).toEqual([]);

    const gone = await act(cookie, "field.harvest", { fieldId: FARM.id });
    expect(await gone.json()).toEqual({ error: "no_field" });
  });

  it("plants a seed in front, which grows for 5 minutes before harvest", async () => {
    // Facing north from (14, 14) puts (14, 13) in front: free grass.
    const { cookie } = await playerAtFarm({ rake: 1, wheat_seeds: 1 });
    await act(cookie, "turn", { facing: "n" });
    const planted = await act(cookie, "field.plant", {});
    expect(planted.status).toBe(200);
    const after = await state(cookie);
    expect(after.inventory).toEqual({ rake: 1 });
    const sprout = after.fields.find((f) => f.id === "heartland:14,13");
    expect(sprout).toMatchObject({ wheat: 50, seeds: 5, readyAt: clock + FIELD_GROW_MS });

    const early = await act(cookie, "field.harvest", { fieldId: "heartland:14,13" });
    expect(await early.json()).toEqual({ error: "field_growing" });
    clock += FIELD_GROW_MS;
    expect((await act(cookie, "field.harvest", { fieldId: "heartland:14,13" })).status).toBe(200);
  });

  it("won't plant without seeds or on a taken tile", async () => {
    const noSeeds = await playerAtFarm({});
    expect(await (await act(noSeeds.cookie, "field.plant", {})).json()).toEqual({
      error: "no_seeds",
    });
    // Still facing the existing field.
    const { cookie } = await playerAtFarm({ wheat_seeds: 1 });
    expect(await (await act(cookie, "field.plant", {})).json()).toEqual({
      error: "cannot_plant_here",
    });
  });

  it("walking away cancels a harvest", async () => {
    const { cookie } = await playerAtFarm();
    await act(cookie, "field.harvest", { fieldId: FARM.id });
    await act(cookie, "move.to", { x: 15, y: 14 });
    clock += HARVEST_DURATION_MS;
    expect((await state(cookie)).inventory).toEqual({ rake: 1 });
  });
});
