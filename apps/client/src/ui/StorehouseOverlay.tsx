import type { GameState, ItemId } from "@nf/shared";
import { useEffect } from "react";
import { StorehousePanel } from "./StorehousePanel.tsx";

type Props = {
  state: GameState;
  onStore: (item: ItemId, quantity: number) => void;
  onTake: (item: ItemId, quantity: number) => void;
  onClose: () => void;
};

/**
 * The storehouse, shown over the map while the player stands at it. Closes
 * with the ✕ button or Esc (and the game screen closes it when they walk away).
 */
export function StorehouseOverlay({ state, onStore, onTake, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="map-overlay storehouse-overlay">
      <button
        type="button"
        className="overlay-close"
        aria-label="Close storehouse"
        onClick={onClose}
      >
        ✕
      </button>
      <StorehousePanel state={state} highlighted={false} onStore={onStore} onTake={onTake} />
    </div>
  );
}
