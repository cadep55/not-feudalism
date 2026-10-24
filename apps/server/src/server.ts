import { createServer } from "node:http";
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
      configureHttp(app, { clientOrigin: env.CLIENT_ORIGIN, logger, checkDatabase });
    },
  });
  // Rooms are registered here (gameServer.define) from issue #10 on.

  await gameServer.listen(env.PORT);
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
