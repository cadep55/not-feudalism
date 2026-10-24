import type { Db } from "@nf/db";
import { ActionRequest } from "@nf/shared";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { currentPlayer, requireSession } from "../auth/require-session.ts";
import { sendFailure } from "../http/failure.ts";
import { loadState, performAction } from "./service.ts";

export type GameDeps = {
  db: Db;
  /** Actions allowed per account per minute. */
  actionsPerMinute: number;
  now?: () => Date;
};

/** GET /state and POST /actions for the logged-in character (mounted at /game). */
export function createGameRouter(deps: GameDeps): Router {
  const now = deps.now ?? (() => new Date());
  const router = Router();
  router.use(requireSession(deps.db, now));

  router.get("/state", async (_req, res) => {
    const state = await loadState(deps.db, currentPlayer(res).characterId);
    res.json({ state });
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
    const result = await performAction(deps.db, currentPlayer(res).characterId, request.data);
    if (!result.ok) return sendFailure(res, result.reason);
    res.json({ state: result.value });
  });

  return router;
}
