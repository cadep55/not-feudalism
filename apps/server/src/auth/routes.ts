import type { Db } from "@nf/db";
import { LoginRequest, SignUpRequest } from "@nf/shared";
import { type CookieOptions, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { sendFailure } from "../http/failure.ts";
import { logIn, signUp } from "./service.ts";
import {
  deleteSession,
  findSessionPlayer,
  SESSION_COOKIE,
  sessionTokenFromCookieHeader,
} from "./sessions.ts";

export type AuthDeps = {
  db: Db;
  /** Secure cookies need HTTPS; on in production, off for http://localhost. */
  secureCookies: boolean;
  /** Sign-up and login attempts allowed per IP per 15 minutes. */
  rateLimitPerWindow: number;
  now?: () => Date;
};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** POST /signup, POST /login, POST /logout, GET /me (mounted at /auth). */
export function createAuthRouter(deps: AuthDeps): Router {
  const now = deps.now ?? (() => new Date());
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: "lax",
    path: "/",
  };
  const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: deps.rateLimitPerWindow,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => sendFailure(res, "rate_limited"),
  });

  const router = Router();

  router.post("/signup", limiter, async (req, res) => {
    const input = SignUpRequest.safeParse(req.body);
    if (!input.success) return sendFailure(res, "invalid_input");
    const result = await signUp(deps.db, input.data, now());
    if (!result.ok) return sendFailure(res, result.reason);
    res.cookie(SESSION_COOKIE, result.value.token, {
      ...cookieOptions,
      expires: result.value.expiresAt,
    });
    res.status(201).json({ player: result.value.player });
  });

  router.post("/login", limiter, async (req, res) => {
    const input = LoginRequest.safeParse(req.body);
    if (!input.success) return sendFailure(res, "invalid_input");
    const result = await logIn(deps.db, input.data, now());
    if (!result.ok) return sendFailure(res, result.reason);
    res.cookie(SESSION_COOKIE, result.value.token, {
      ...cookieOptions,
      expires: result.value.expiresAt,
    });
    res.json({ player: result.value.player });
  });

  router.post("/logout", async (req, res) => {
    const token = sessionTokenFromCookieHeader(req.headers.cookie);
    if (token) await deleteSession(deps.db, token);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get("/me", async (req, res) => {
    const token = sessionTokenFromCookieHeader(req.headers.cookie);
    const player = token ? await findSessionPlayer(deps.db, token, now()) : null;
    if (!player) return sendFailure(res, "not_authenticated");
    res.json({ player });
  });

  return router;
}
