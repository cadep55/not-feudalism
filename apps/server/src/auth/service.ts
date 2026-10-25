import { accounts, characters, type Db } from "@nf/db";
import {
  fail,
  type LoginRequest,
  ok,
  type RuleResult,
  type SignUpRequest,
  SPAWN_POINT,
  STARTING_REGION,
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

/** Creates the account, its character and a session in one transaction. */
export async function signUp(
  db: Db,
  input: SignUpRequest,
  now: Date,
): Promise<RuleResult<LoggedIn, "email_taken" | "name_taken">> {
  const passwordHash = await hashPassword(input.password);
  try {
    return ok(
      await db.transaction(async (tx) => {
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
            region: STARTING_REGION,
            x: SPAWN_POINT.x,
            y: SPAWN_POINT.y,
          })
          .returning({ id: characters.id, name: characters.name });
        if (!character) throw new Error("character insert returned no row");
        await createStartingWorld(tx, character.id);

        const session = await createSession(tx, account.id, now);
        return {
          player: {
            accountId: account.id,
            email: account.email,
            characterId: character.id,
            characterName: character.name,
          },
          ...session,
        };
      }),
    );
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
