import type { Db } from "@nf/db";
import type { RequestHandler, Response } from "express";
import { sendFailure } from "../http/failure.ts";
import { findSessionPlayer, type SessionPlayer, sessionTokenFromCookieHeader } from "./sessions.ts";

/** Rejects requests without a valid session (401 not_authenticated); otherwise records the player. */
export function requireSession(db: Db, now: () => Date): RequestHandler {
  return async (req, res, next) => {
    const token = sessionTokenFromCookieHeader(req.headers.cookie);
    const player = token ? await findSessionPlayer(db, token, now()) : null;
    if (!player) return sendFailure(res, "not_authenticated");
    res.locals.player = player;
    next();
  };
}

/** The player recorded by requireSession. Only call in handlers mounted after it. */
export function currentPlayer(res: Response): SessionPlayer {
  const player = res.locals.player as SessionPlayer | undefined;
  if (!player) throw new Error("currentPlayer() used on a route without requireSession");
  return player;
}
