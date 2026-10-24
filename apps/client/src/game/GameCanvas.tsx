import { useEffect, useRef } from "react";

/**
 * Hosts the Phaser game. Phaser is loaded lazily so the login screen stays
 * small and tests of React screens never load a canvas engine.
 */
export function GameCanvas({ characterName }: { characterName: string }) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    import("./createGame.ts").then(({ createGame }) => {
      if (cancelled || !parent.current) return;
      const game = createGame(parent.current, { characterName });
      destroy = () => game.destroy(true);
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [characterName]);

  return <div ref={parent} className="canvas" data-testid="game-canvas" />;
}
