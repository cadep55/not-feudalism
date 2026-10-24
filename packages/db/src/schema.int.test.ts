import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.ts";
import { readDbEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";
import { accounts, characters } from "./schema.ts";

const { DATABASE_URL } = readDbEnv();
const { db, close } = createDb(DATABASE_URL);

// Unique per run so tests never collide with seed data or each other.
const uniqueEmail = () => `test-${randomUUID()}@example.test`;
const uniqueName = () => `T${randomUUID().slice(0, 8)}`;

async function createAccount(email = uniqueEmail()) {
  const [account] = await db
    .insert(accounts)
    .values({ email, passwordHash: "test-hash" })
    .returning();
  if (!account) throw new Error("insert returned no row");
  return account;
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
});

afterAll(async () => {
  await close();
});

describe("database schema", () => {
  it("re-running migrations is a no-op", async () => {
    await expect(runMigrations(DATABASE_URL)).resolves.toBeUndefined();
  });

  it("treats emails as case-insensitive and unique", async () => {
    const email = uniqueEmail();
    await createAccount(email);
    await expect(createAccount(email.toUpperCase())).rejects.toThrow();
  });

  it("gives new characters peasant rank and zero gold", async () => {
    const account = await createAccount();
    const [character] = await db
      .insert(characters)
      .values({ accountId: account.id, name: uniqueName(), region: "heartland", x: 0, y: 0 })
      .returning();
    expect(character).toMatchObject({ rank: "peasant", gold: 0 });
  });

  it("allows only one character per account", async () => {
    const account = await createAccount();
    const values = { accountId: account.id, region: "heartland", x: 0, y: 0 };
    await db.insert(characters).values({ ...values, name: uniqueName() });
    await expect(db.insert(characters).values({ ...values, name: uniqueName() })).rejects.toThrow();
  });

  it("deletes a character when its account is deleted", async () => {
    const account = await createAccount();
    await db
      .insert(characters)
      .values({ accountId: account.id, name: uniqueName(), region: "heartland", x: 0, y: 0 });

    await db.delete(accounts).where(eq(accounts.id, account.id));

    const remaining = await db
      .select()
      .from(characters)
      .where(eq(characters.accountId, account.id));
    expect(remaining).toEqual([]);
  });
});
