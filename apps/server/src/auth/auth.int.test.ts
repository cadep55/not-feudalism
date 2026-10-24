import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { accounts, createDb, readDbEnv, runMigrations } from "@nf/db";
import { SPAWN_POINT, STARTING_REGION } from "@nf/shared";
import { eq, sql } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureHttp } from "../http/app.ts";
import {
  authenticateCookieHeader,
  createSession,
  SESSION_COOKIE,
  type SessionPlayer,
} from "./sessions.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);
const servers: { close: () => void }[] = [];

type CallOptions = { method?: string; body?: unknown; cookie?: string };

async function startApp(rateLimitPerWindow = 1_000) {
  const app = express();
  configureHttp(app, {
    clientOrigin: "http://localhost:5173",
    logger: pino({ level: "silent" }),
    checkDatabase: async () => {},
    auth: { db, secureCookies: false, rateLimitPerWindow },
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return (path: string, options: CallOptions = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
}

/** "nf_session=…" from a response's Set-Cookie, ready to send back. */
function sessionCookie(res: Response): string {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!header) throw new Error("no session cookie set");
  return header.split(";")[0] ?? "";
}

/** Unique per call so tests never collide with each other or with seed data. */
function newPlayer() {
  const id = randomUUID().slice(0, 8);
  return {
    email: `p-${id}@example.test`,
    password: "correct horse battery",
    characterName: `P${id}`,
  };
}

let call: Awaited<ReturnType<typeof startApp>>;

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  call = await startApp();
});

afterAll(async () => {
  for (const server of servers) server.close();
  await close();
});

describe("sign-up", () => {
  it("creates the account and character at the spawn point, and logs the player in", async () => {
    const player = newPlayer();
    const res = await call("/auth/signup", { body: player });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { player: SessionPlayer };
    expect(body.player).toMatchObject({
      email: player.email,
      characterName: player.characterName,
    });

    const setCookie = res.headers.getSetCookie().join("; ");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const me = await call("/auth/me", { cookie: sessionCookie(res) });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { player: SessionPlayer }).player.characterId).toBe(
      body.player.characterId,
    );

    const [row] = await db.execute<{ region: string; x: number; y: number }>(
      sql`select region, x, y from characters where id = ${body.player.characterId}`,
    );
    expect(row).toEqual({ region: STARTING_REGION, ...SPAWN_POINT });
  });

  it("stores only an argon2id hash of the password", async () => {
    const player = newPlayer();
    await call("/auth/signup", { body: player });
    const [account] = await db.select().from(accounts).where(eq(accounts.email, player.email));
    expect(account?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(account?.passwordHash).not.toContain(player.password);
  });

  it("rejects a taken email regardless of case", async () => {
    const player = newPlayer();
    await call("/auth/signup", { body: player });
    const res = await call("/auth/signup", {
      body: { ...newPlayer(), email: player.email.toUpperCase() },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("rejects a taken character name regardless of case", async () => {
    const player = newPlayer();
    await call("/auth/signup", { body: player });
    const res = await call("/auth/signup", {
      body: { ...newPlayer(), characterName: player.characterName.toLowerCase() },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "name_taken" });
  });

  it("rejects invalid input", async () => {
    const res = await call("/auth/signup", { body: { ...newPlayer(), password: "short" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
  });
});

describe("login and logout", () => {
  it("logs in with the right password, case-insensitively by email", async () => {
    const player = newPlayer();
    await call("/auth/signup", { body: player });
    const res = await call("/auth/login", {
      body: { email: player.email.toUpperCase(), password: player.password },
    });
    expect(res.status).toBe(200);
    expect((await call("/auth/me", { cookie: sessionCookie(res) })).status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const player = newPlayer();
    await call("/auth/signup", { body: player });
    const wrong = await call("/auth/login", {
      body: { email: player.email, password: "nope-nope" },
    });
    const unknown = await call("/auth/login", {
      body: { email: "nobody@example.test", password: "nope-nope" },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "invalid_credentials" });
    expect(await unknown.json()).toEqual({ error: "invalid_credentials" });
  });

  it("ends the session on logout", async () => {
    const res = await call("/auth/signup", { body: newPlayer() });
    const cookie = sessionCookie(res);
    const logout = await call("/auth/logout", { method: "POST", cookie });
    expect(logout.status).toBe(204);
    expect(logout.headers.getSetCookie().join(";")).toContain(`${SESSION_COOKIE}=;`);
    expect((await call("/auth/me", { cookie })).status).toBe(401);
  });

  it("refuses banned accounts after a correct password, and drops their sessions", async () => {
    const player = newPlayer();
    const res = await call("/auth/signup", { body: player });
    await db.update(accounts).set({ bannedAt: new Date() }).where(eq(accounts.email, player.email));

    const login = await call("/auth/login", {
      body: { email: player.email, password: player.password },
    });
    expect(login.status).toBe(403);
    expect(await login.json()).toEqual({ error: "account_banned" });
    expect((await call("/auth/me", { cookie: sessionCookie(res) })).status).toBe(401);
  });
});

describe("sessions", () => {
  it("rejects requests without a session, or with a made-up one", async () => {
    expect((await call("/auth/me")).status).toBe(401);
    expect((await call("/auth/me", { cookie: `${SESSION_COOKIE}=made-up` })).status).toBe(401);
  });

  it("rejects expired sessions", async () => {
    const res = await call("/auth/signup", { body: newPlayer() });
    const { player } = (await res.json()) as { player: SessionPlayer };
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const { token } = await createSession(db, player.accountId, longAgo);
    expect((await call("/auth/me", { cookie: `${SESSION_COOKIE}=${token}` })).status).toBe(401);
  });

  it("authenticates a room join from its Cookie header", async () => {
    const res = await call("/auth/signup", { body: newPlayer() });
    const { player } = (await res.json()) as { player: SessionPlayer };
    const header = `theme=dark; ${sessionCookie(res)}`;
    expect(await authenticateCookieHeader(db, header, new Date())).toEqual(player);
    expect(await authenticateCookieHeader(db, undefined, new Date())).toBeNull();
  });
});

describe("rate limiting", () => {
  it("limits sign-up and login attempts per IP", async () => {
    const limited = await startApp(2);
    const attempt = () =>
      limited("/auth/login", { body: { email: "nobody@example.test", password: "x" } });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
  });
});
