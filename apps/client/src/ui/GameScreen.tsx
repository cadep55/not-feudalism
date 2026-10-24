import type { Direction, GameState, NodeId, RecipeId } from "@nf/shared";
import { useCallback, useEffect, useState } from "react";
import type { MoveOutcome } from "../game/createGame.ts";
import { GameCanvas } from "../game/GameCanvas.tsx";
import { refreshDelay } from "../game/gathering.ts";
import type { Tile } from "../game/movement.ts";
import type { Api, Player } from "../net/api.ts";
import { CraftingPanel } from "./CraftingPanel.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { FAILURE_MESSAGES } from "./messages.ts";

/** How long a refusal message stays on screen. */
export const NOTICE_MS = 2_500;

type Props = {
  api: Api;
  player: Player;
  onLogOut: () => void;
};

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; state: GameState };

export function GameScreen({ api, player, onLogOut }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const showState = useCallback((state: GameState) => setLoad({ status: "ready", state }), []);

  useEffect(() => {
    let cancelled = false;
    api.getState().then((result) => {
      if (cancelled) return;
      if (result.ok) showState(result.value);
      else setLoad({ status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [api, showState]);

  // Jobs finish on the server lazily: once the timer is up, read state to collect the result.
  const job = load.status === "ready" ? load.state.job : null;
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        api.getState().then((result) => {
          if (!cancelled && result.ok) showState(result.value);
        });
      },
      refreshDelay(job, Date.now()),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, job, showState]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const sendPosition = useCallback(
    async (tile: Tile): Promise<MoveOutcome> => {
      const result = await api.sendAction({ type: "move.to", payload: tile });
      // The reply carries the job too: walking away cancels a gather (a craft keeps going).
      if (result.ok) {
        showState(result.value);
        return { ok: true, facing: result.value.character.facing };
      }
      // A network blip isn't a refusal: keep walking, the next update carries a newer position.
      if (result.reason === "network_error") return { ok: true, facing: null };
      const truth = await api.getState();
      if (truth.ok) showState(truth.value);
      const position = truth.ok ? { x: truth.value.character.x, y: truth.value.character.y } : tile;
      const facing = truth.ok ? truth.value.character.facing : null;
      return { ok: false, position, facing, message: FAILURE_MESSAGES[result.reason] };
    },
    [api, showState],
  );

  const startGather = useCallback(
    async (nodeId: NodeId) => {
      const result = await api.sendAction({ type: "gather.start", payload: { nodeId } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );

  // Turning in place, e.g. to face a node before gathering at it.
  const turn = useCallback(
    async (facing: Direction): Promise<boolean> => {
      const result = await api.sendAction({ type: "turn", payload: { facing } });
      if (result.ok) {
        showState(result.value);
        return true;
      }
      setNotice(FAILURE_MESSAGES[result.reason]);
      return false;
    },
    [api, showState],
  );

  // Materials leave the inventory as soon as the server accepts; the item arrives when the job ends.
  const startCraft = useCallback(
    async (recipeId: RecipeId) => {
      const result = await api.sendAction({ type: "craft.start", payload: { recipeId } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
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
          <div className="play">
            <GameCanvas
              character={load.state.character}
              job={load.state.job}
              sendPosition={sendPosition}
              startGather={startGather}
              turn={turn}
            />
            <div className="side">
              <InventoryPanel inventory={load.state.inventory} job={load.state.job} />
              <CraftingPanel
                inventory={load.state.inventory}
                job={load.state.job}
                onCraft={startCraft}
              />
            </div>
          </div>
          {notice && (
            <p role="alert" className="notice">
              {notice}
            </p>
          )}
          <p className="hint">
            Click a tile to walk there, or use the arrow keys / WASD. Click a tree, rock or field to
            gather.
          </p>
        </>
      )}
    </div>
  );
}
