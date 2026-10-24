import type { CharacterState } from "@nf/shared";
import { useEffect, useRef } from "react";
import type { MoveOutcome } from "./createGame.ts";
import type { Tile } from "./movement.ts";

type Props = {
  character: CharacterState;
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
};

/**
 * Hosts the Phaser game. Phaser is loaded lazily so the login screen stays
 * small and tests of React screens never load a canvas engine.
 */
export function GameCanvas({ character, sendPosition }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  // The game is created once per character; it always calls the latest sendPosition.
  const send = useRef(sendPosition);
  send.current = sendPosition;
  const initial = useRef(character);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    import("./createGame.ts").then(({ createGame }) => {
      if (cancelled || !parent.current) return;
      const game = createGame(parent.current, {
        character: initial.current,
        sendPosition: (tile) => send.current(tile),
      });
      destroy = () => game.destroy(true);
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return <div ref={parent} className="canvas" data-testid="game-canvas" />;
}
