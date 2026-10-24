import { PROTOCOL_VERSION } from "@nf/shared";
import { readServerEnv } from "./env.ts";
import { createLogger } from "./logger.ts";
import { startServer } from "./server.ts";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = readServerEnv();
const logger = createLogger(env);
const server = await startServer(env, logger).catch((err: unknown) => {
  logger.fatal({ err }, "server failed to start");
  process.exit(1);
});
logger.info(
  { port: server.port, protocol: PROTOCOL_VERSION, env: env.NODE_ENV },
  "server listening",
);

let stopping = false;
async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down");
  const timer = setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  try {
    await server.stop();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
