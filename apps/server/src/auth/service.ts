import { accounts, characters, type Db, type DbExecutor, worlds } from "@nf/db";
import {
  fail,
  type LoginRequest,
  ok,
  openSections,
  type RegionId,
  type RuleResult,
  type SignUpRequest,
  SPAWN_POINT,
} from "@nf/shared";
import { eq, sql } from "drizzle-orm";
import { createStartingWorld } from "../game/world.ts";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password.ts";
import { createSession, type SessionPlayer } from "./sessions.ts";

export type LoggedIn = { player: SessionPlayer; token: string; expiresAt: Date };

const UNIQUE_VIOLATION = "23505";

/** Postgres unique-violation details, whether or not Drizzle wrapped the driver error. */
function uniqueViolation(err: unknown): string | undefined {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  for (const candidate of candidates) {
    const e = candidate as { code?: string; constraint_name?: string } | undefined;
    if (e?.code === UNIQUE_VIOLATION) return e.constraint_name ?? "";
  }
  return undefined;
}

/** Which world new players join, and how their section is picked from the free ones. */
export type WorldChoice = {
  /** The name of the world to join; created if it doesn't exist yet. */
  name: () => string;
  /** Picks one of the free sections (never empty). */
  pickSection: (free: RegionId[]) => RegionId;
};

/** The main world, with a random free section: what players get. */
export const MAIN_WORLD: WorldChoice = {
  name: () => "main",
  pickSection: (free) => free[Math.floor(Math.random() * free.length)] ?? free[0] ?? "heartland",
};

/**
 * Locks the world (so two sign-ups can't take the same section) and picks a
 * free section for a new player, or null when the world is full.
 */
async function claimSection(
  tx: DbExecutor,
  choice: WorldChoice,
): Promise<{ worldId: string; region: RegionId } | null> {
  const name = choice.name();
  await tx.insert(worlds).values({ name }).onConflictDoNothing();
  const [world] = await tx.select().from(worlds).where(eq(worlds.name, name)).for("update");
  if (!world) throw new Error(`World ${name} not found`);
  const taken = await tx
    .select({ region: characters.homeRegion })
    .from(characters)
    .where(eq(characters.worldId, world.id));
  const free = openSections(taken.map((t) => t.region));
  if (free.length === 0) return null;
  return { worldId: world.id, region: choice.pickSection(free) };
}

/**
 * Creates the account, its character in a free section of the world, and a
 * session, in one transaction. Refused when the world is full (ADR 0004).
 */
export async function signUp(
  db: Db,
  input: SignUpRequest,
  now: Date,
  world: WorldChoice = MAIN_WORLD,
): Promise<RuleResult<LoggedIn, "email_taken" | "name_taken" | "world_full">> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const section = await claimSection(tx, world);
      if (!section) return fail("world_full");
      const [account] = await tx
        .insert(accounts)
        .values({ email: input.email, passwordHash })
        .returning({ id: accounts.id, email: accounts.email });
      if (!account) throw new Error("account insert returned no row");

      const [character] = await tx
        .insert(characters)
        .values({
          accountId: account.id,
          name: input.characterName,
          region: section.region,
          worldId: section.worldId,
          homeRegion: section.region,
          x: SPAWN_POINT.x,
          y: SPAWN_POINT.y,
        })
        .returning({ id: characters.id, name: characters.name });
      if (!character) throw new Error("character insert returned no row");
      await createStartingWorld(tx, character.id, section.region);

      const session = await createSession(tx, account.id, now);
      return ok({
        player: {
          accountId: account.id,
          email: account.email,
          characterId: character.id,
          characterName: character.name,
        },
        ...session,
      });
    });
  } catch (err) {
    const constraint = uniqueViolation(err);
    if (constraint === "accounts_email_lower_idx") return fail("email_taken");
    if (constraint === "characters_name_lower_idx") return fail("name_taken");
    throw err;
  }
}

export async function logIn(
  db: Db,
  input: LoginRequest,
  now: Date,
): Promise<RuleResult<LoggedIn, "invalid_credentials" | "account_banned">> {
  const [row] = await db
    .select({
      accountId: accounts.id,
      email: accounts.email,
      passwordHash: accounts.passwordHash,
      bannedAt: accounts.bannedAt,
      characterId: characters.id,
      characterName: characters.name,
    })
    .from(accounts)
    .innerJoin(characters, eq(characters.accountId, accounts.id))
    .where(sql`lower(${accounts.email}) = lower(${input.email})`);

  if (!row) {
    await verifyAgainstDummy(input.password);
    return fail("invalid_credentials");
  }
  if (!(await verifyPassword(row.passwordHash, input.password))) {
    return fail("invalid_credentials");
  }
  // Only revealed after a correct password, so it can't be used to probe accounts.
  if (row.bannedAt) return fail("account_banned");

  const session = await createSession(db, row.accountId, now);
  const { passwordHash: _hash, bannedAt: _banned, ...player } = row;
  return ok({ player, ...session });
}
