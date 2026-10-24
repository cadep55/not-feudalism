import { sql } from "drizzle-orm";
import { createDb } from "./client.ts";
import { readDbEnv } from "./env.ts";
import { accounts, characters } from "./schema.ts";

// Development-only data. Login doesn't exist until Step 5, so these accounts
// carry a placeholder hash that no password can match.
const SEED_PASSWORD_HASH = "seed-account-no-login";

const SEED_PLAYERS = [
  { email: "alice@example.test", name: "Alice", region: "heartland", x: 10, y: 12 },
  { email: "bob@example.test", name: "Bob", region: "heartland", x: 14, y: 12 },
] as const;

export async function seed(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl);
  try {
    for (const player of SEED_PLAYERS) {
      await db.transaction(async (tx) => {
        await tx
          .insert(accounts)
          .values({ email: player.email, passwordHash: SEED_PASSWORD_HASH })
          .onConflictDoNothing();
        const [account] = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(sql`lower(${accounts.email}) = lower(${player.email})`);
        if (!account) throw new Error(`Seeding ${player.email} returned no row`);

        await tx
          .insert(characters)
          .values({
            accountId: account.id,
            name: player.name,
            region: player.region,
            x: player.x,
            y: player.y,
          })
          .onConflictDoNothing({ target: characters.accountId });
      });
    }
  } finally {
    await close();
  }
}

if (import.meta.main) {
  const { DATABASE_URL } = readDbEnv();
  await seed(DATABASE_URL);
  console.log(`Seeded ${SEED_PLAYERS.length} development players.`);
}
