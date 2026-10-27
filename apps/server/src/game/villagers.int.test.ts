import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createDb, readDbEnv, runMigrations, storehouseItems, villagers } from "@nf/db";
import {
  type GameState,
  houseDoor,
  RESOURCE_NODES,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
  STOREHOUSE_LIMIT,
  taskTimeline,
  VILLAGER_LOAD,
  VILLAGER_NAMES,
  type VillagerTask,
} from "@nf/shared";
import { and, eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";
import { TEST_WORLD } from "../test-world.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];
const tree = RESOURCE_NODES.heartland_tree;
const store = STARTING_STOREHOUSE;

// The game's clock, an hour ahead of real time.
let clock = Date.now() + 60 * 60 * 1000;

type Call = (path: string, options?: { body?: unknown; cookie?: string }) => Promise<Response>;
let call: Call;

async function startApp(): Promise<Call> {
  const app = express();
  configureHttp(app, {
    clientOrigin: "http://localhost:5173",
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    auth: { db, secureCookies: false, rateLimitPerWindow: 1_000, world: TEST_WORLD },
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

async function newPlayer(stored: Record<string, number> = {}) {
  const id = randomUUID().slice(0, 8);
  const res = await call("/auth/signup", {
    body: {
      email: `v-${id}@example.test`,
      password: "correct horse battery",
      characterName: `V${id}`,
    },
  });
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  const { player } = (await res.json()) as { player: { characterId: string } };
  for (const [itemId, quantity] of Object.entries(stored)) {
    await db.insert(storehouseItems).values({ characterId: player.characterId, itemId, quantity });
  }
  return { cookie, characterId: player.characterId };
}

async function assign(cookie: string, villagerId: string, job: string): Promise<Response> {
  return call("/game/actions", {
    cookie,
    body: { requestId: randomUUID(), type: "villager.assign", payload: { villagerId, job } },
  });
}

async function state(cookie: string): Promise<GameState> {
  return ((await (await call("/game/state", { cookie })).json()) as { state: GameState }).state;
}

/** When delivery k of a wood-gathering task started at `since` lands. */
function woodDelivery(since: number, k: number): number {
  const task: VillagerTask = {
    kind: "gather",
    nodeId: "heartland_tree",
    storehouseId: store.id,
    since,
    delivered: 0,
  };
  const route = {
    door: houseDoor(STARTING_HOUSE),
    storehouse: store,
    buildings: [...STARTING_BUILDINGS],
  };
  const t = taskTimeline(task, tree, route);
  return since + t.outbound + k * t.cycle - t.leg;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("villagers", () => {
  it("every new character starts with a storehouse, and a house of 3 idle villagers with names", async () => {
    const { cookie } = await newPlayer();
    const { villagers: list, buildings, storage } = await state(cookie);
    expect(buildings).toHaveLength(STARTING_BUILDINGS.length);
    expect(buildings).toEqual(expect.arrayContaining([...STARTING_BUILDINGS]));
    expect(storage).toEqual({ [store.id]: {} });
    expect(list.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
    for (const v of list) {
      expect(VILLAGER_NAMES).toContain(v.name);
      expect(v.houseId).toBe(STARTING_HOUSE.id);
      expect(v.task).toBeNull();
    }
  });

  it("a villager sent for wood fills the storehouse 5 at a time, even while the player is away", async () => {
    const { cookie, characterId } = await newPlayer();
    const since = clock;
    expect((await assign(cookie, "v1", "wood")).status).toBe(200);

    clock = woodDelivery(since, 1) - 1;
    expect((await state(cookie)).storage[store.id]).toEqual({});
    clock = woodDelivery(since, 1);
    expect((await state(cookie)).storage[store.id]).toEqual({ wood: VILLAGER_LOAD });

    // Away for a long time: deliveries keep landing, up to the storehouse's 100.
    clock += 24 * 60 * 60 * 1000;
    const later = await state(cookie);
    expect(later.storage[store.id]).toEqual({ wood: STOREHOUSE_LIMIT });
    expect(later.villagers.find((v) => v.id === "v1")?.task).toBeNull();

    const [row] = await db
      .select()
      .from(villagers)
      .where(and(eq(villagers.characterId, characterId), eq(villagers.villagerId, "v1")));
    expect(row?.task).toBeNull();
  });

  it("farming needs a rake in the storehouse; going idle puts it back", async () => {
    const noRake = await newPlayer();
    const refused = await assign(noRake.cookie, "v1", "wheat");
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "no_rake_in_storehouse" });

    const { cookie } = await newPlayer({ rake: 1 });
    expect((await assign(cookie, "v2", "wheat")).status).toBe(200);
    const farming = await state(cookie);
    expect(farming.storage[store.id]).toEqual({});
    expect(farming.villagers.find((v) => v.id === "v2")?.task).toMatchObject({
      kind: "harvest",
      fieldId: "heartland:13,14",
    });

    expect((await assign(cookie, "v2", "idle")).status).toBe(200);
    expect((await state(cookie)).storage[store.id]).toEqual({ rake: 1 });
  });

  it("rejects unknown villagers and jobs", async () => {
    const { cookie } = await newPlayer();
    expect(await (await assign(cookie, "v9", "wood")).json()).toEqual({ error: "no_villager" });
    expect((await assign(cookie, "v1", "fishing")).status).toBe(400);
  });
});
