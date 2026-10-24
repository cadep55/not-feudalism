import type { CharacterState, GameState, Job, NodeId } from "@nf/shared";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** The inventory's rows as text, e.g. ["Wood1"]. */
function inventoryRows() {
  const panel = screen.getByRole("region", { name: "Inventory" });
  return within(panel)
    .queryAllByRole("listitem")
    .map((row) => row.textContent);
}

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
    expect(inventoryRows()).toEqual(["Wood1"]);
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

describe("GameScreen crafting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const MATERIALS: GameState = { ...ALICE_STATE, inventory: { wood: 2, stone: 1 } };

  function crafting(now: number): GameState {
    return {
      ...ALICE_STATE,
      inventory: {},
      job: { kind: "craft", recipeId: "rake", startedAt: now, completesAt: now + 3_000 },
    };
  }

  it("sends craft.start and shows the materials gone and the job running", async () => {
    const started = crafting(Date.now());
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: MATERIALS })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: started })),
    });
    await renderReady(api);
    expect(inventoryRows()).toEqual(["Wood2", "Stone1"]);

    await userEvent.click(screen.getByRole("button", { name: "Craft Rake" }));

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "craft.start",
      payload: { recipeId: "rake" },
    });
    expect(inventoryRows()).toEqual([]);
    expect(canvas.props?.job).toEqual(started.job);
    expect(screen.getByRole("status")).toHaveTextContent("Crafting rake…");
    expect(screen.getByRole("button", { name: "Craft Rake" })).toBeDisabled();
  });

  it("explains a missing_materials refusal", async () => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: MATERIALS })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "missing_materials" as const })),
    });
    await renderReady(api);

    await userEvent.click(screen.getByRole("button", { name: "Craft Rake" }));

    expect(screen.getByRole("alert")).toHaveTextContent("You don't have the materials for that.");
    expect(inventoryRows()).toEqual(["Wood2", "Stone1"]);
  });

  it("re-reads state when the craft is due, so the rake appears", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: MATERIALS })) });
    await renderReady(api);
    vi.useFakeTimers();
    const finished: GameState = { ...ALICE_STATE, inventory: { rake: 1 }, job: null };
    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: crafting(Date.now()) });
    vi.mocked(api.getState).mockResolvedValue({ ok: true, value: finished });

    await act(async () => {
      screen.getByRole("button", { name: "Craft Rake" }).click();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Crafting rake…");
    expect(api.getState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000 + JOB_SETTLE_MS);
    });
    expect(api.getState).toHaveBeenCalledTimes(2);
    expect(inventoryRows()).toEqual(["Rake1"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the craft running while walking", async () => {
    const started = crafting(Date.now());
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: MATERIALS })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: started })),
    });
    await renderReady(api);
    await userEvent.click(screen.getByRole("button", { name: "Craft Rake" }));

    // The server's reply to a move still carries the craft job.
    vi.mocked(api.sendAction).mockResolvedValueOnce({
      ok: true,
      value: { ...started, character: { ...started.character, x: 9, y: 9 } },
    });
    await act(async () => {
      await canvas.props?.sendPosition({ x: 9, y: 9 });
    });
    expect(canvas.props?.job).toEqual(started.job);
    expect(screen.getByRole("status")).toHaveTextContent("Crafting rake…");
  });
});
