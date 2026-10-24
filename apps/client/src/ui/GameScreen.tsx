import type { CharacterState } from "@nf/shared";
import { useCallback, useEffect, useState } from "react";
import type { MoveOutcome } from "../game/createGame.ts";
import { GameCanvas } from "../game/GameCanvas.tsx";
import type { Tile } from "../game/movement.ts";
import type { Api, Player } from "../net/api.ts";
import { FAILURE_MESSAGES } from "./messages.ts";

type Props = {
  api: Api;
  player: Player;
  onLogOut: () => void;
};

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; character: CharacterState };

export function GameScreen({ api, player, onLogOut }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api.getState().then((result) => {
      if (cancelled) return;
      setLoad(
        result.ok ? { status: "ready", character: result.value.character } : { status: "error" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const sendPosition = useCallback(
    async (tile: Tile): Promise<MoveOutcome> => {
      const result = await api.sendAction({ type: "move.to", payload: tile });
      if (result.ok) return { ok: true };
      // A network blip isn't a refusal: keep walking, the next update carries a newer position.
      if (result.reason === "network_error") return { ok: true };
      const truth = await api.getState();
      const position = truth.ok ? { x: truth.value.character.x, y: truth.value.character.y } : tile;
      return { ok: false, position, message: FAILURE_MESSAGES[result.reason] };
    },
    [api],
  );

  return (
    <div className="game">
      <header>
        <span>
          Playing as <strong>{player.characterName}</strong>
        </span>
        <button type="button" onClick={onLogOut}>
          Log out
        </button>
      </header>
      {load.status === "loading" && <p className="status">Loading your world…</p>}
      {load.status === "error" && (
        <p role="alert" className="status error">
          {FAILURE_MESSAGES.network_error}
        </p>
      )}
      {load.status === "ready" && (
        <>
          <GameCanvas character={load.character} sendPosition={sendPosition} />
          <p className="hint">Click a tile to walk there, or use the arrow keys / WASD.</p>
        </>
      )}
    </div>
  );
}
