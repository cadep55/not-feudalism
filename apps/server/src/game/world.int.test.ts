import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { buildings, characters, createDb, readDbEnv, runMigrations } from "@nf/db";
import {
  type GameState,
  REGIONS,
  type RegionId,
  TRAVEL_DURATION_MS,
  type WorldOverview,
} from "@nf/shared";
import { eq } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAIN_WORLD, type WorldChoice } from "../auth/service.ts";
import { SESSION_COOKIE } from "../auth/sessions.ts";
import { configureHttp } from "../http/app.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];
const REACHABLE = (Object.keys(REGIONS) as RegionId[]).filter((id) => REGIONS[id].reachable);

type Call = (path: string, options?: { body?: unknown; cookie?: string }) => Promise<Response>;

/** A fresh world's name, the same for every sign-up (unlike TEST_WORLD, which makes one per sign-up). */
function oneWorld(): () => string {
  const name = `world-test-${randomUUID()}`;
  return () => name;
}

/** An app whose sign-ups join the given world. */
async function startApp(world: WorldChoice): Promise<Call> {
  const app = express();
  configureHttp(app, {
    clientOrigin: "http://localhost:5173",
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    auth: { db, secureCookies: false, rateLimitPerWindow: 1_000, world },
    game: { db, actionsPerMinute: 1_000 },
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

async function signUp(call: Call) {
  const id = randomUUID().slice(0, 8);
  return call("/auth/signup", {
    body: {
      email: `w-${id}@example.test`,
      password: "correct horse battery",
      characterName: `W${id}`,
    },
  });
}

function cookieOf(res: Response): string {
  const cookie = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

async function state(call: Call, cookie: string): Promise<GameState> {
  return ((await (await call("/game/state", { cookie })).json()) as { state: GameState }).state;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("joining the shared world", () => {
  it("gives each player a different reachable section, with their base in it, until the world is full", async () => {
    const call = await startApp({ ...MAIN_WORLD, name: oneWorld() });
    const homes: string[] = [];
    for (const _ of REACHABLE) {
      const res = await signUp(call);
      expect(res.status).toBe(201);
      const mine = await state(call, cookieOf(res));
      expect(mine.character.region).toBe(mine.character.homeRegion);
      expect(mine.buildings.every((b) => b.region === mine.character.homeRegion)).toBe(true);
      expect(mine.fields.every((f) => f.region === mine.character.homeRegion)).toBe(true);
      homes.push(mine.character.homeRegion);
    }
    expect([...homes].sort()).toEqual([...REACHABLE].sort());

    // One player per section: the next one waits.
    const full = await signUp(call);
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: "world_full" });
  });

  it("tells a character still waiting for a section that the world is full", async () => {
    const call = await startApp({ ...MAIN_WORLD, name: oneWorld() });
    const res = await signUp(call);
    const { player } = (await res.clone().json()) as { player: { characterId: string } };
    await db
      .update(characters)
      .set({ worldId: null, homeRegion: null })
      .where(eq(characters.id, player.characterId));
    const waiting = await call("/game/state", { cookie: cookieOf(res) });
    expect(waiting.status).toBe(409);
    expect(await waiting.json()).toEqual({ error: "world_full" });
  });

  it("puts the starting base in the player's own section", async () => {
    const call = await startApp({
      name: oneWorld(),
      pickSection: () => "south",
    });
    const res = await signUp(call);
    const { player } = (await res.clone().json()) as { player: { characterId: string } };
    const rows = await db
      .select()
      .from(buildings)
      .where(eq(buildings.characterId, player.characterId));
    expect(rows.map((r) => r.region)).toEqual(["south", "south"]);
    const mine = await state(call, cookieOf(res));
    expect(mine.character).toMatchObject({ region: "south", homeRegion: "south" });
  });

  it("travels to the next section after 5 seconds, and sees the neighbour's base there", async () => {
    let clock = Date.now() + 60 * 60 * 1000;
    const picks: RegionId[] = ["heartland", "north"];
    const app = express();
    configureHttp(app, {
      clientOrigin: "http://localhost:5173",
      logger: pino({ level: "silent" }),
      checkDatabase: async () => {},
      auth: {
        db,
        secureCookies: false,
        rateLimitPerWindow: 1_000,
        world: { name: oneWorld(), pickSection: () => picks.shift() ?? "south" },
      },
      game: { db, actionsPerMinute: 1_000, now: () => new Date(clock) },
    });
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const call: Call = (path, options = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: options.body ? "POST" : "GET",
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
    const act = (cookie: string, type: string, payload: unknown) =>
      call("/game/actions", { cookie, body: { requestId: randomUUID(), type, payload } });

    const traveller = cookieOf(await signUp(call));
    await signUp(call); // The neighbour, at home in north.

    expect((await act(traveller, "move.to", { x: 12, y: 0 })).status).toBe(200);
    const started = await act(traveller, "travel.start", {});
    expect(started.status).toBe(200);

    clock += TRAVEL_DURATION_MS;
    const arrived = await state(call, traveller);
    expect(arrived.character).toMatchObject({
      region: "north",
      homeRegion: "heartland",
      x: 12,
      y: 16,
    });
    expect(arrived.others).toHaveLength(1);
    expect(arrived.others[0]?.buildings.map((b) => b.kind).sort()).toEqual(["house", "storehouse"]);
    expect(arrived.others[0]?.buildings.every((b) => b.region === "north")).toBe(true);

    // At home there's nobody else to see.
    const away = await act(traveller, "travel.start", {});
    expect(await away.json()).toEqual({ error: "not_at_travel_zone" });
  });

  it("tells the world view who calls each section home", async () => {
    const picks: RegionId[] = ["heartland", "east_coast"];
    const call = await startApp({ name: oneWorld(), pickSection: () => picks.shift() ?? "south" });
    const me = await signUp(call);
    const neighbour = await signUp(call);
    const { player } = (await neighbour.clone().json()) as { player: { characterName: string } };
    const res = await call("/game/world", { cookie: cookieOf(me) });
    expect(res.status).toBe(200);
    const { world } = (await res.json()) as { world: WorldOverview };
    expect(world.home).toBe("heartland");
    expect(world.here).toBe("heartland");
    expect(world.owners.east_coast).toBe(player.characterName);
    expect(Object.keys(world.owners).sort()).toEqual(["east_coast", "heartland"]);
  });
});
