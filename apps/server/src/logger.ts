import { type Logger, pino } from "pino";
import type { ServerEnv } from "./env.ts";

export type { Logger };

/** Structured JSON logs; human-readable in development. Never log secrets (docs/ARCHITECTURE.md §7). */
export function createLogger(env: Pick<ServerEnv, "NODE_ENV" | "LOG_LEVEL">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
    ...(env.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    }),
  });
}
