import { characters, type Db } from "@nf/db";
import { ActionRequest, type WorldOverview } from "@nf/shared";
import { eq } from "drizzle-orm";
import { type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { currentPlayer, requireSession } from "../auth/require-session.ts";
import { sendFailure } from "../http/failure.ts";
import { performAction, readState } from "./service.ts";

export type GameDeps = {
  db: Db;
  /** Actions allowed per account per minute. */
  actionsPerMinute: number;
  now?: () => Date;
};

/** Characters still waiting for a free section can't play yet: the world is full (ADR 0004). */
function requireSection(db: Db): RequestHandler {
  return async (_req, res, next) => {
    const [row] = await db
      .select({ homeRegion: characters.homeRegion })
      .from(characters)
      .where(eq(characters.id, currentPlayer(res).characterId));
    if (!row?.homeRegion) return sendFailure(res, "world_full");
    next();
  };
}

/** GET /state and POST /actions for the logged-in character (mounted at /game). */
export function createGameRouter(deps: GameDeps): Router {
  const now = deps.now ?? (() => new Date());
  const router = Router();
  router.use(requireSession(deps.db, now));
  router.use(requireSection(deps.db));

  router.get("/state", async (_req, res) => {
    const state = await readState(deps.db, currentPlayer(res).characterId, now());
    res.json({ state });
  });

  // The world view: who calls each section home, and where this player is.
  router.get("/world", async (_req, res) => {
    const [me] = await deps.db
      .select({
        worldId: characters.worldId,
        homeRegion: characters.homeRegion,
        region: characters.region,
      })
      .from(characters)
      .where(eq(characters.id, currentPlayer(res).characterId));
    if (!me?.worldId || !me.homeRegion) return sendFailure(res, "world_full");
    const players = await deps.db
      .select({ name: characters.name, homeRegion: characters.homeRegion })
      .from(characters)
      .where(eq(characters.worldId, me.worldId));
    const owners: Record<string, string> = {};
    for (const p of players) if (p.homeRegion) owners[p.homeRegion] = p.name;
    const world: WorldOverview = { home: me.homeRegion, here: me.region, owners };
    res.json({ world });
  });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.actionsPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Per account, not per IP: players behind the same network don't share a budget.
    keyGenerator: (_req, res) => currentPlayer(res).accountId,
    handler: (_req, res) => sendFailure(res, "rate_limited"),
  });

  router.post("/actions", limiter, async (req, res) => {
    const request = ActionRequest.safeParse(req.body);
    if (!request.success) return sendFailure(res, "invalid_input");
    const result = await performAction(
      deps.db,
      currentPlayer(res).characterId,
      request.data,
      now(),
    );
    if (!result.ok) return sendFailure(res, result.reason);
    res.json({ state: result.value });
  });

  return router;
}
