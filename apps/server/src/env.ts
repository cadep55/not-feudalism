import { z } from "zod";

const ServerEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(2567),
  CLIENT_ORIGIN: z.url(),
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
