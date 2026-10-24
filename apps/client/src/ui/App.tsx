import { useEffect, useState } from "react";
import type { Api, Player } from "../net/api.ts";
import { AuthScreen } from "./AuthScreen.tsx";
import { GameScreen } from "./GameScreen.tsx";
import { FAILURE_MESSAGES } from "./messages.ts";

type State =
  | { screen: "loading" }
  | { screen: "blocked"; message: string }
  | { screen: "auth" }
  | { screen: "game"; player: Player };

export function App({ api }: { api: Api }) {
  const [state, setState] = useState<State>({ screen: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const protocol = await api.checkProtocol();
      if (cancelled) return;
      if (!protocol.ok) {
        setState({ screen: "blocked", message: FAILURE_MESSAGES.network_error });
        return;
      }
      if (!protocol.value) {
        setState({ screen: "blocked", message: FAILURE_MESSAGES.protocol_mismatch });
        return;
      }
      // Resume an existing session if the cookie is still valid.
      const me = await api.me();
      if (!cancelled) setState(me.ok ? { screen: "game", player: me.value } : { screen: "auth" });
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  switch (state.screen) {
    case "loading":
      return <p className="status">Connecting…</p>;
    case "blocked":
      return (
        <p role="alert" className="status error">
          {state.message}
        </p>
      );
    case "auth":
      return <AuthScreen api={api} onLoggedIn={(player) => setState({ screen: "game", player })} />;
    case "game":
      return (
        <GameScreen
          player={state.player}
          onLogOut={async () => {
            await api.logOut();
            setState({ screen: "auth" });
          }}
        />
      );
  }
}
