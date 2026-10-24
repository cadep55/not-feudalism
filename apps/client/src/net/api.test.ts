import { PROTOCOL_VERSION } from "@nf/shared";
import { describe, expect, it, vi } from "vitest";
import { ALICE_STATE } from "../test-helpers.ts";
import { createApi } from "./api.ts";

const SERVER = "http://server.test";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApi", () => {
  it("sends credentials and JSON, and unwraps the player", async () => {
    const player = { accountId: "a", email: "a@b.test", characterId: "c", characterName: "A" };
    const fetchImpl = vi.fn(async () => jsonResponse(200, { player }));
    const api = createApi(SERVER, fetchImpl);

    expect(await api.logIn({ email: "a@b.test", password: "pw" })).toEqual({
      ok: true,
      value: player,
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${SERVER}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email: "a@b.test", password: "pw" }),
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
  });

  it("turns server errors into failure reasons", async () => {
    const api = createApi(SERVER, async () => jsonResponse(409, { error: "email_taken" }));
    expect(
      await api.signUp({ email: "a@b.test", password: "x".repeat(10), characterName: "Al1" }),
    ).toEqual({
      ok: false,
      reason: "email_taken",
    });
  });

  it("treats unknown errors and unreachable servers as network errors", async () => {
    const garbled = createApi(SERVER, async () => jsonResponse(500, { error: "kaboom" }));
    expect(await garbled.me()).toEqual({ ok: false, reason: "network_error" });

    const offline = createApi(SERVER, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await offline.me()).toEqual({ ok: false, reason: "network_error" });
  });

  it("loads the game state", async () => {
    const api = createApi(SERVER, async () => jsonResponse(200, { state: ALICE_STATE }));
    expect(await api.getState()).toEqual({ ok: true, value: ALICE_STATE });
  });

  it("sends actions with a fresh requestId, or the one given for a retry", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { state: ALICE_STATE }));
    const api = createApi(SERVER, fetchImpl);
    const action = { type: "move.to" as const, payload: { x: 1, y: 2 } };

    await api.sendAction(action);
    await api.sendAction(action);
    await api.sendAction(action, "retry-me");

    const bodies = fetchImpl.mock.calls.map(
      (args) =>
        JSON.parse(String((args as unknown as [string, RequestInit])[1].body)) as {
          requestId: string;
        },
    );
    expect(bodies[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[0]?.requestId).not.toBe(bodies[1]?.requestId);
    expect(bodies[2]).toEqual({ requestId: "retry-me", ...action });
  });

  it("reports rule failures from actions", async () => {
    const api = createApi(SERVER, async () => jsonResponse(422, { error: "out_of_bounds" }));
    expect(await api.sendAction({ type: "move.to", payload: { x: 99, y: 0 } })).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("handles empty 204 responses", async () => {
    const api = createApi(SERVER, async () => new Response(null, { status: 204 }));
    expect(await api.logOut()).toEqual({ ok: true, value: undefined });
  });

  it("compares the server's protocol version with ours", async () => {
    const same = createApi(SERVER, async () => jsonResponse(200, { protocol: PROTOCOL_VERSION }));
    expect(await same.checkProtocol()).toEqual({ ok: true, value: true });

    const newer = createApi(SERVER, async () =>
      jsonResponse(200, { protocol: PROTOCOL_VERSION + 1 }),
    );
    expect(await newer.checkProtocol()).toEqual({ ok: true, value: false });
  });
});
