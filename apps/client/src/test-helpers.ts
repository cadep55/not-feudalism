import type { GameState } from "@nf/shared";
import { vi } from "vitest";
import type { Api, Player } from "./net/api.ts";

export const ALICE_STATE: GameState = {
  character: {
    id: "c1",
    name: "Alice",
    rank: "peasant",
    gold: 0,
    region: "heartland",
    x: 10,
    y: 10,
  },
};

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
    getState: vi.fn(async () => ({ ok: true as const, value: ALICE_STATE })),
    sendAction: vi.fn(async () => ({ ok: true as const, value: ALICE_STATE })),
    ...overrides,
  };
}
