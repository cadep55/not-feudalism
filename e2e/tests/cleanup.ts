import { existsSync } from "node:fs";
import { accounts, createDb } from "@nf/db";
import { inArray } from "drizzle-orm";

// The e2e tests play in the dev server's main world, which holds one player per
// section (ADR 0004). Each test deletes the players it signed up, so test runs
// never fill the world. Locally the database address comes from the root .env.
const rootEnv = new URL("../../.env", import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const created: string[] = [];

/** Remembers a test player's email so it's deleted after the test. */
export function rememberPlayer(email: string): void {
  created.push(email);
}

/** Deletes every remembered test player (their characters and bases go with them). */
export async function deletePlayers(): Promise<void> {
  if (created.length === 0) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is needed to clean up e2e players");
  const { db, close } = createDb(url);
  try {
    await db.delete(accounts).where(inArray(accounts.email, created.splice(0)));
  } finally {
    await close();
  }
}
