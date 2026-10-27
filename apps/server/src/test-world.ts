import { randomUUID } from "node:crypto";
import type { WorldChoice } from "./auth/service.ts";

/**
 * For integration tests: every sign-up gets a brand-new world, and starts in
 * heartland. Tests never fill the main world, however many players they
 * create, and always know where a new player stands.
 */
export const TEST_WORLD: WorldChoice = {
  name: () => `test-${randomUUID()}`,
  pickSection: (free) => (free.includes("heartland") ? "heartland" : (free[0] ?? "heartland")),
};
