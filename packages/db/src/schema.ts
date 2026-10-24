import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    // Last move, for walking-speed checks (ADR 0002).
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
    // One of the 8 directions in packages/shared/src/game/direction.ts.
    facing: text("facing").notNull().default("s"),
    ...timestamps,
  },
  (table) => [uniqueIndex("characters_name_lower_idx").on(sql`lower(${table.name})`)],
);

/**
 * Every action a character sent, with the result it got. Keyed by the client's
 * requestId so a retried request returns the stored result instead of applying
 * twice (ADR 0002). Also an audit trail for debugging and cheat reports.
 */
export const gameActions = pgTable(
  "game_actions",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    // The RuleResult sent back to the client: { ok: true, value } or { ok: false, reason }.
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.requestId] }),
    index("game_actions_created_at_idx").on(table.createdAt),
  ],
);

/** Item counts per character. A row exists only while the count is above zero. */
export const inventories = pgTable(
  "inventories",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // Item IDs come from packages/shared/src/data/items.ts.
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.itemId] }),
    check("inventories_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

/**
 * Timed actions (golden rule 5): gathering now, crafting and travel later.
 * Resolved lazily when state is read; finished and cancelled jobs stay as history.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completesAt: timestamp("completes_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // "completed" or "cancelled" once resolved.
    outcome: text("outcome"),
  },
  (table) => [
    // At most one job in progress per character.
    uniqueIndex("jobs_one_active_per_character_idx")
      .on(table.characterId)
      .where(sql`${table.resolvedAt} is null`),
  ],
);
