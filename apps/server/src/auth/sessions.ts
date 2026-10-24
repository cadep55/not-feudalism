import { createHash, randomBytes } from "node:crypto";
import { accounts, characters, type Db, type DbExecutor, sessions } from "@nf/db";
import { parseCookie } from "cookie";
import { and, eq, gt, isNull } from "drizzle-orm";

export const SESSION_COOKIE = "nf_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Who a valid session belongs to. */
export type SessionPlayer = {
  accountId: string;
  email: string;
  characterId: string;
  characterName: string;
};

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored, so a leaked database can't be used to log in. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Reads the session token from a raw Cookie header (HTTP requests and room joins). */
export function sessionTokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return parseCookie(header)[SESSION_COOKIE] || undefined;
}

export async function createSession(
  db: DbExecutor,
  accountId: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionToken(token), accountId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}

/** The player behind a session token, or null if it's unknown, expired or the account is banned. */
export async function findSessionPlayer(
  db: Db,
  token: string,
  now: Date,
): Promise<SessionPlayer | null> {
  const [row] = await db
    .select({
      accountId: accounts.id,
      email: accounts.email,
      characterId: characters.id,
      characterName: characters.name,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .innerJoin(characters, eq(characters.accountId, accounts.id))
    .where(
      and(
        eq(sessions.id, hashSessionToken(token)),
        gt(sessions.expiresAt, now),
        isNull(accounts.bannedAt),
      ),
    );
  return row ?? null;
}

/**
 * Authenticates a WebSocket room join from its Cookie header, the same session
 * check as HTTP. Rooms call this from Colyseus's onAuth (issue #10).
 */
export async function authenticateCookieHeader(
  db: Db,
  cookieHeader: string | undefined,
  now: Date,
): Promise<SessionPlayer | null> {
  const token = sessionTokenFromCookieHeader(cookieHeader);
  return token ? findSessionPlayer(db, token, now) : null;
}
