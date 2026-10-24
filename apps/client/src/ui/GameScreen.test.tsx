import type { CharacterState } from "@nf/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MoveOutcome } from "../game/createGame.ts";
import type { Tile } from "../game/movement.ts";
import { ALICE, ALICE_STATE, fakeApi } from "../test-helpers.ts";
import { GameScreen } from "./GameScreen.tsx";

// Capture what the screen hands the game, without loading Phaser.
const canvas = vi.hoisted(() => ({
  props: null as null | {
    character: CharacterState;
    sendPosition: (t: Tile) => Promise<MoveOutcome>;
  },
}));
vi.mock("../game/GameCanvas.tsx", () => ({
  GameCanvas: (props: NonNullable<typeof canvas.props>) => {
    canvas.props = props;
    return <div data-testid="game-canvas" />;
  },
}));

async function renderReady(api = fakeApi()) {
  render(<GameScreen api={api} player={ALICE} onLogOut={vi.fn()} />);
  await screen.findByTestId("game-canvas");
  const props = canvas.props;
  if (!props) throw new Error("GameCanvas was not rendered");
  return { api, props };
}

describe("GameScreen", () => {
  it("loads the saved state and starts the game where the character left off", async () => {
    const { props } = await renderReady();
    expect(props.character).toEqual(ALICE_STATE.character);
    expect(screen.getByText(/arrow keys/)).toBeInTheDocument();
  });

  it("says so when the state can't be loaded", async () => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: false as const, reason: "network_error" as const })),
    });
    render(<GameScreen api={api} player={ALICE} onLogOut={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("sends positions as move.to actions", async () => {
    const { api, props } = await renderReady();
    expect(await props.sendPosition({ x: 3, y: 4 })).toEqual({ ok: true });
    expect(api.sendAction).toHaveBeenCalledWith({ type: "move.to", payload: { x: 3, y: 4 } });
  });

  it("snaps back to the server's position when a move is refused", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "moved_too_fast" as const })),
    });
    const { props } = await renderReady(api);
    expect(await props.sendPosition({ x: 20, y: 15 })).toEqual({
      ok: false,
      position: { x: ALICE_STATE.character.x, y: ALICE_STATE.character.y },
      message: "Slow down! You can't walk that fast.",
    });
  });

  it("keeps walking through a network blip", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "network_error" as const })),
    });
    const { props } = await renderReady(api);
    expect(await props.sendPosition({ x: 3, y: 4 })).toEqual({ ok: true });
    expect(api.getState).toHaveBeenCalledTimes(1);
  });
});
