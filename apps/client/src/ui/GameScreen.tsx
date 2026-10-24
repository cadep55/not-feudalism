import { GameCanvas } from "../game/GameCanvas.tsx";
import type { Player } from "../net/api.ts";

type Props = {
  player: Player;
  onLogOut: () => void;
};

export function GameScreen({ player, onLogOut }: Props) {
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
      <GameCanvas characterName={player.characterName} />
    </div>
  );
}
