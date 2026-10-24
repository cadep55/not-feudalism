import { z } from "zod";

const ServerEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // 0 picks a free port (used by tests).
  PORT: z.coerce.number().int().min(0).max(65_535).default(2567),
  CLIENT_ORIGIN: z.url(),
  // Sign-up and login attempts allowed per IP per 15 minutes.
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

/** Validates server config at startup; the server refuses to start without it. */
export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = ServerEnv.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${z.prettifyError(result.error)}\n` +
        "Copy .env.example to .env at the repo root (see README → Getting started).",
    );
  }
  return result.data;
}
