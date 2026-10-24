import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createDb } from "@nf/db";
import { sql } from "drizzle-orm";
import type { ServerEnv } from "./env.ts";
import { configureHttp } from "./http/app.ts";
import type { Logger } from "./logger.ts";

export type RunningServer = {
  port: number;
  /** Stops accepting connections, disposes rooms, then closes the database. */
  stop: () => Promise<void>;
};

/**
 * Colyseus 0.18 only subscribes to the HTTP server's "error" event after a successful
 * listen, so a failure such as EADDRINUSE never settles its promise and startup hangs.
 * Racing it against the error event makes startup fail fast instead.
 */
function listen(gameServer: Server, httpServer: HttpServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    gameServer.listen(port).then(() => {
      httpServer.off("error", reject);
      resolve();
    }, reject);
  });
}

/** Express (HTTP) and Colyseus (WebSocket rooms) on one port, in one process. */
export async function startServer(env: ServerEnv, logger: Logger): Promise<RunningServer> {
  const { db, close } = createDb(env.DATABASE_URL);
  const checkDatabase = async () => {
    await db.execute(sql`select 1`);
  };

  const httpServer = createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    // We own signal handling (index.ts) so shutdown order is ours: rooms first, database last.
    gracefullyShutdown: false,
    greet: false,
    logger,
    express: (app) => {
      configureHttp(app, {
        clientOrigin: env.CLIENT_ORIGIN,
        logger,
        checkDatabase,
        auth: {
          db,
          secureCookies: env.NODE_ENV === "production",
          rateLimitPerWindow: env.AUTH_RATE_LIMIT,
        },
      });
    },
  });
  // Rooms are registered here (gameServer.define) from issue #10 on.

  try {
    await listen(gameServer, httpServer, env.PORT);
  } catch (err) {
    await close();
    throw err;
  }
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : env.PORT;

  return {
    port,
    stop: async () => {
      await gameServer.gracefullyShutdown(false);
      await close();
    },
  };
}
