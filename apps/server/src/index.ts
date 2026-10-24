import { createDb } from "@nf/db";
import { PROTOCOL_VERSION } from "@nf/shared";
import { sql } from "drizzle-orm";
import { readServerEnv } from "./env.ts";

// Placeholder until the Express + Colyseus server shell (Step 5 of docs/INFRASTRUCTURE_PLAN.md):
// validates config and proves the database is reachable.
const env = readServerEnv();
const { db, close } = createDb(env.DATABASE_URL);

try {
  const [row] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from characters`,
  );
  console.log(
    `not-feudalism server placeholder (protocol v${PROTOCOL_VERSION}, ${env.NODE_ENV}): ` +
      `database OK, ${row?.count ?? 0} characters. HTTP and rooms arrive in Step 5.`,
  );
} finally {
  await close();
}
