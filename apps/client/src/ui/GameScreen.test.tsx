import type { CharacterState, GameState, Job, NodeId } from "@nf/shared";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MoveOutcome } from "../game/createGame.ts";
import { JOB_SETTLE_MS } from "../game/gathering.ts";
import type { Tile } from "../game/movement.ts";
import { ALICE, ALICE_STATE, fakeApi } from "../test-helpers.ts";
import { GameScreen, NOTICE_MS } from "./GameScreen.tsx";

// Capture what the screen hands the game, without loading Phaser.
const canvas = vi.hoisted(() => ({
  props: null as null | {
    character: CharacterState;
    job: Job | null;
    sendPosition: (t: Tile) => Promise<MoveOutcome>;
    startGather: (nodeId: NodeId) => void | Promise<void>;
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

describe("GameScreen gathering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The latest props, since every state change re-renders the canvas. */
  function latest() {
    const props = canvas.props;
    if (!props) throw new Error("GameCanvas was not rendered");
    return props;
  }

  function gathering(now: number): GameState {
    return {
      ...ALICE_STATE,
      job: { kind: "gather", nodeId: "heartland_tree", startedAt: now, completesAt: now + 3_000 },
    };
  }

  it("starts a gather and shows the job", async () => {
    const started = gathering(Date.now());
    const api = fakeApi({ sendAction: vi.fn(async () => ({ ok: true as const, value: started })) });
    await renderReady(api);
    expect(screen.getByText("Empty — click a tree or rock to gather.")).toBeInTheDocument();

    await act(async () => {
      await latest().startGather("heartland_tree");
    });

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "gather.start",
      payload: { nodeId: "heartland_tree" },
    });
    expect(latest().job).toEqual(started.job);
    expect(screen.getByRole("status")).toHaveTextContent("Gathering wood…");
  });

  it("explains a refusal, then clears the message", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "missing_tool" as const })),
    });
    await renderReady(api);
    vi.useFakeTimers();

    await act(async () => {
      await latest().startGather("heartland_farm");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("You need a rake to harvest wheat.");
    expect(latest().job).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTICE_MS);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("re-reads state when the job is due, so the inventory fills", async () => {
    const api = fakeApi();
    await renderReady(api);
    vi.useFakeTimers();
    const started = gathering(Date.now());
    const finished: GameState = { ...ALICE_STATE, inventory: { wood: 1 }, job: null };
    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: started });
    vi.mocked(api.getState).mockResolvedValue({ ok: true, value: finished });

    await act(async () => {
      await latest().startGather("heartland_tree");
    });
    expect(api.getState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000 + JOB_SETTLE_MS - 1);
    });
    expect(api.getState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.getState).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("listitem")).toHaveTextContent("Wood1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(latest().job).toBeNull();
  });

  it("drops the job when walking away cancels it", async () => {
    const api = fakeApi();
    await renderReady(api);
    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: gathering(Date.now()) });
    await act(async () => {
      await latest().startGather("heartland_tree");
    });
    expect(latest().job).not.toBeNull();

    await act(async () => {
      await latest().sendPosition({ x: 9, y: 9 });
    });
    expect(latest().job).toBeNull();
  });
});
