import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integration tests (*.int.test.ts) need DATABASE_URL: from CI's env, or the repo-root .env locally.
const rootEnv = new URL("../../.env", import.meta.url);
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    // Colyseus keeps process-wide state, so run test files one at a time.
    fileParallelism: false,
  },
});
