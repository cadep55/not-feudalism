import { PROTOCOL_VERSION } from "@nf/shared";
import { describe, expect, it, vi } from "vitest";
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
