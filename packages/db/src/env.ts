import { z } from "zod";

const DbEnv = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type DbEnv = z.infer<typeof DbEnv>;

/** Reads and validates the database settings, failing with a readable message. */
export function readDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  const result = DbEnv.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid database environment:\n${z.prettifyError(result.error)}\n` +
        "Copy .env.example to .env at the repo root (see README → Getting started).",
    );
  }
  return result.data;
}
