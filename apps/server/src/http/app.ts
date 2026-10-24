import cors from "cors";
import express, { type Application, type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { type AuthDeps, createAuthRouter } from "../auth/routes.ts";
import type { Logger } from "../logger.ts";

export type HttpDeps = {
  clientOrigin: string;
  logger: Logger;
  /** Resolves when the database answers; rejects otherwise. */
  checkDatabase: () => Promise<void>;
  /** Mounts /auth when provided (tests of the base app can leave it out). */
  auth?: AuthDeps;
};

/** Installs middleware and HTTP routes. Colyseus adds its matchmaking routes to the same app. */
export function configureHttp(app: Application, deps: HttpDeps): void {
  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
    }),
  );
  app.use(helmet());
  // A list (not a bare string) so the header is only sent when the request's origin matches.
  app.use(cors({ origin: [deps.clientOrigin], credentials: true }));
  app.use(express.json({ limit: "16kb" }));

  // Process is up. Hosts use this to decide whether to restart the server.
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Ready for players: dependencies reachable. Hosts route traffic only when this passes.
  app.get("/readyz", async (_req, res) => {
    try {
      await deps.checkDatabase();
      res.json({ status: "ready" });
    } catch (err) {
      deps.logger.warn({ err }, "readiness check failed");
      res.status(503).json({ status: "unavailable" });
    }
  });

  if (deps.auth) app.use("/auth", createAuthRouter(deps.auth));

  const handleError: ErrorRequestHandler = (err, req, res, _next) => {
    // Client errors from middleware (bad JSON 400, body too large 413) keep their status.
    const status = typeof err?.status === "number" && err.status >= 400 ? err.status : 500;
    if (status >= 500) {
      req.log.error({ err }, "unhandled request error");
      res.status(500).json({ error: "internal_error" });
      return;
    }
    res.status(status).json({ error: status === 413 ? "payload_too_large" : "bad_request" });
  };
  app.use(handleError);
}
