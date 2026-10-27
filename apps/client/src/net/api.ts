import {
  type FailureReason,
  type GameAction,
  type GameState,
  isFailureReason,
  type LoginRequest,
  PROTOCOL_VERSION,
  type SignUpRequest,
  type WorldOverview,
} from "@nf/shared";

/** Mirrors the server's SessionPlayer (apps/server/src/auth/sessions.ts). */
export type Player = {
  accountId: string;
  email: string;
  characterId: string;
  characterName: string;
};

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: FailureReason | "network_error" };

export type Api = ReturnType<typeof createApi>;

/** The only place the client talks HTTP to the server. Session cookies ride along automatically. */
export function createApi(serverUrl: string, fetchImpl: typeof fetch = fetch) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(`${serverUrl}${path}`, {
        ...init,
        credentials: "include",
        ...(init.body ? { headers: { "content-type": "application/json" } } : {}),
      });
    } catch {
      return { ok: false, reason: "network_error" };
    }
    if (res.status === 204) return { ok: true, value: undefined as T };
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, value: body as T };
    const error = (body as { error?: unknown } | null)?.error;
    return { ok: false, reason: isFailureReason(error) ? error : "network_error" };
  }

  const post = <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    signUp: async (input: SignUpRequest) =>
      unwrapPlayer(await post<{ player: Player }>("/auth/signup", input)),
    logIn: async (input: LoginRequest) =>
      unwrapPlayer(await post<{ player: Player }>("/auth/login", input)),
    logOut: () => post<void>("/auth/logout"),
    me: async () => unwrapPlayer(await request<{ player: Player }>("/auth/me")),
    /** ok(true) when client and server speak the same protocol version. */
    checkProtocol: async (): Promise<ApiResult<boolean>> => {
      const result = await request<{ protocol: number }>("/version");
      return result.ok ? { ok: true, value: result.value.protocol === PROTOCOL_VERSION } : result;
    },
    getState: async () => unwrapState(await request<{ state: GameState }>("/game/state")),
    /** Who calls each section home, for the world view. */
    getWorld: async (): Promise<ApiResult<WorldOverview>> => {
      const result = await request<{ world: WorldOverview }>("/game/world");
      return result.ok ? { ok: true, value: result.value.world } : result;
    },
    /**
     * Sends one action. Pass the same requestId when retrying after a network
     * error, so the server applies it at most once.
     */
    sendAction: async (action: GameAction, requestId: string = newRequestId()) =>
      unwrapState(await post<{ state: GameState }>("/game/actions", { requestId, ...action })),
  };
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

function unwrapPlayer(result: ApiResult<{ player: Player }>): ApiResult<Player> {
  return result.ok ? { ok: true, value: result.value.player } : result;
}

function unwrapState(result: ApiResult<{ state: GameState }>): ApiResult<GameState> {
  return result.ok ? { ok: true, value: result.value.state } : result;
}
