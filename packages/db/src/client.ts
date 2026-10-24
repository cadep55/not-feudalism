import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, close: () => sql.end() };
}

export type Db = ReturnType<typeof createDb>["db"];

/** A connection or an open transaction: functions taking this work inside or outside db.transaction(). */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
