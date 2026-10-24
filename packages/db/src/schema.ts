import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Conventions (docs/ARCHITECTURE.md §3): plural table names, snake_case columns,
// UUID keys, created_at/updated_at everywhere, money and quantities as integers.

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("accounts_email_lower_idx").on(sql`lower(${table.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the session token; the raw token only ever lives in the player's cookie.
    id: text("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_account_id_idx").on(table.accountId)],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // One character per account to start (docs/ARCHITECTURE.md §3).
    accountId: uuid("account_id")
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Rank IDs come from packages/shared data tables once they exist.
    rank: text("rank").notNull().default("peasant"),
    // Smallest coin unit; never a float.
    gold: integer("gold").notNull().default(0),
    region: text("region").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("characters_name_lower_idx").on(sql`lower(${table.name})`)],
);
