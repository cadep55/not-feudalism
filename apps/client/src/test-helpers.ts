import { vi } from "vitest";
import type { Api, Player } from "./net/api.ts";

export const ALICE: Player = {
  accountId: "a1",
  email: "alice@example.test",
  characterId: "c1",
  characterName: "Alice",
};

/** An Api whose every call succeeds by default; override per test. */
export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    signUp: vi.fn(async () => ({ ok: true as const, value: ALICE })),
    logIn: vi.fn(async () => ({ ok: true as const, value: ALICE })),
    logOut: vi.fn(async () => ({ ok: true as const, value: undefined })),
    me: vi.fn(async () => ({ ok: false as const, reason: "not_authenticated" as const })),
    checkProtocol: vi.fn(async () => ({ ok: true as const, value: true })),
    ...overrides,
  };
}
