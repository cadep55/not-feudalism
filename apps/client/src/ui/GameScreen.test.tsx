import {
  type CharacterState,
  type Direction,
  FIELD_GROW_MS,
  type Field,
  type GameState,
  type Job,
  type NodeId,
  newField,
  RESOURCE_NODES,
  taskTimeline,
  type Villager,
} from "@nf/shared";
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
    fields: Field[];
    villagers: Villager[];
    sendPosition: (t: Tile) => Promise<MoveOutcome>;
    startGather: (nodeId: NodeId) => void | Promise<void>;
    startHarvest: (fieldId: string) => void | Promise<void>;
    turn: (facing: Direction) => Promise<boolean>;
    openStorehouse: () => void;
  },
}));
vi.mock("../game/GameCanvas.tsx", () => ({
  GameCanvas: (props: NonNullable<typeof canvas.props>) => {
    canvas.props = props;
    return <div data-testid="game-canvas" />;
  },
}));

/** The inventory's rows as text, e.g. ["Wood 1/5"]. */
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
    expect(await props.sendPosition({ x: 3, y: 4 })).toEqual({ ok: true, facing: "s" });
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
      facing: ALICE_STATE.character.facing,
      message: "Slow down! You can't walk that fast.",
    });
  });

  it("keeps walking through a network blip", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "network_error" as const })),
    });
    const { props } = await renderReady(api);
    expect(await props.sendPosition({ x: 3, y: 4 })).toEqual({ ok: true, facing: null });
    expect(api.getState).toHaveBeenCalledTimes(1);
  });
});

describe("GameScreen turning", () => {
  it("sends a turn action and shows the new facing", async () => {
    const turned: GameState = {
      ...ALICE_STATE,
      character: { ...ALICE_STATE.character, facing: "nw" },
    };
    const api = fakeApi({ sendAction: vi.fn(async () => ({ ok: true as const, value: turned })) });
    const { props } = await renderReady(api);

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await props.turn("nw");
    });

    expect(accepted).toBe(true);
    expect(api.sendAction).toHaveBeenCalledWith({ type: "turn", payload: { facing: "nw" } });
    expect(canvas.props?.character.facing).toBe("nw");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a refused turn and reports it to the game", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "busy" as const })),
    });
    const { props } = await renderReady(api);

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await props.turn("e");
    });

    expect(accepted).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("You're busy with another job.");
  });

  it("explains a not_facing refusal when gathering", async () => {
    const api = fakeApi({
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "not_facing" as const })),
    });
    const { props } = await renderReady(api);
    await act(async () => {
      await props.startGather("heartland_tree");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Face it to gather.");
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
      await latest().startHarvest("heartland:13,14");
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
    expect(inventoryRows()).toEqual(["Wood 1/5"]);
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

describe("GameScreen farming", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function latest() {
    const props = canvas.props;
    if (!props) throw new Error("GameCanvas was not rendered");
    return props;
  }

  const FIELD = newField("heartland", 13, 14, 0);
  /** Beside the starting field at (13, 14), facing it, with a rake. */
  const AT_FIELD: GameState = {
    ...ALICE_STATE,
    character: { ...ALICE_STATE.character, x: 12, y: 14, facing: "e" },
    inventory: { rake: 1 },
    fields: [FIELD],
  };

  function harvesting(now: number): GameState {
    return {
      ...AT_FIELD,
      job: { kind: "harvest", fieldId: FIELD.id, startedAt: now, completesAt: now + 3_000 },
    };
  }

  it("hands the fields to the game", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: AT_FIELD })) });
    await renderReady(api);
    expect(latest().fields).toEqual([FIELD]);
  });

  it("sends field.harvest and shows the harvest running", async () => {
    const started = harvesting(Date.now());
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_FIELD })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: started })),
    });
    await renderReady(api);

    await act(async () => {
      await latest().startHarvest(FIELD.id);
    });

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "field.harvest",
      payload: { fieldId: FIELD.id },
    });
    expect(latest().job).toEqual(started.job);
    expect(screen.getByRole("status")).toHaveTextContent("Harvesting wheat…");
  });

  it("re-reads state when the harvest is due: wheat arrives and the field shrinks", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: AT_FIELD })) });
    await renderReady(api);
    vi.useFakeTimers();
    const harvested = { ...FIELD, wheat: FIELD.wheat - 1, harvests: 1 };
    const finished: GameState = {
      ...AT_FIELD,
      inventory: { rake: 1, wheat: 1 },
      fields: [harvested],
      job: null,
    };
    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: harvesting(Date.now()) });
    vi.mocked(api.getState).mockResolvedValue({ ok: true, value: finished });

    await act(async () => {
      await latest().startHarvest(FIELD.id);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000 + JOB_SETTLE_MS);
    });

    expect(inventoryRows()).toEqual(["Wheat 1/5", "Rake 1/5"]);
    expect(latest().fields).toEqual([harvested]);
    expect(latest().job).toBeNull();
  });

  it("drops the harvest when walking away cancels it", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: AT_FIELD })) });
    await renderReady(api);
    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: harvesting(Date.now()) });
    await act(async () => {
      await latest().startHarvest(FIELD.id);
    });
    expect(latest().job).not.toBeNull();

    vi.mocked(api.sendAction).mockResolvedValueOnce({ ok: true, value: AT_FIELD });
    await act(async () => {
      await latest().sendPosition({ x: 11, y: 14 });
    });
    expect(latest().job).toBeNull();
  });

  it.each([
    ["field_growing", "That field is still growing."],
    ["no_field", "That field is gone."],
    ["missing_tool", "You need a rake to harvest wheat."],
  ] as const)("explains a %s refusal when harvesting", async (reason, message) => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_FIELD })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason })),
    });
    await renderReady(api);
    await act(async () => {
      await latest().startHarvest(FIELD.id);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(latest().job).toBeNull();
  });

  it("plants a seed: one seed fewer and a growing field on the map", async () => {
    const withSeed: GameState = { ...AT_FIELD, inventory: { wheat_seeds: 1 } };
    const planted = newField("heartland", 12, 15, Date.now() + FIELD_GROW_MS);
    const afterPlanting: GameState = {
      ...withSeed,
      inventory: {},
      fields: [FIELD, planted],
    };
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: withSeed })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: afterPlanting })),
    });
    await renderReady(api);
    expect(inventoryRows()).toEqual(["Wheat seeds 1/5"]);

    await userEvent.click(screen.getByRole("button", { name: "Plant seed" }));

    expect(api.sendAction).toHaveBeenCalledWith({ type: "field.plant", payload: {} });
    expect(inventoryRows()).toEqual([]);
    expect(latest().fields).toEqual([FIELD, planted]);
    expect(screen.getByRole("button", { name: "Plant seed" })).toBeDisabled();
  });

  it.each([
    ["cannot_plant_here", "You can't plant there. Face an empty grass tile."],
    ["no_seeds", "You have no wheat seeds."],
    ["out_of_bounds", "You can't go there."],
  ] as const)("explains a %s refusal when planting", async (reason, message) => {
    const withSeed: GameState = { ...AT_FIELD, inventory: { wheat_seeds: 1 } };
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: withSeed })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason })),
    });
    await renderReady(api);
    await userEvent.click(screen.getByRole("button", { name: "Plant seed" }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(inventoryRows()).toEqual(["Wheat seeds 1/5"]);
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
    expect(inventoryRows()).toEqual(["Wood 2/5", "Stone 1/5"]);

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
    expect(inventoryRows()).toEqual(["Wood 2/5", "Stone 1/5"]);
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
    expect(inventoryRows()).toEqual(["Rake 1/5"]);
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

describe("GameScreen storehouse", () => {
  /** Beside the storehouse at (15, 8) and facing it. */
  const AT_STOREHOUSE: GameState = {
    ...ALICE_STATE,
    character: { ...ALICE_STATE.character, x: 14, y: 8, facing: "e" },
    inventory: { wood: 3 },
    storage: { stone: 7 },
  };

  function storehouseRows() {
    const list = screen.queryByRole("list", { name: "In the storehouse" });
    return list
      ? within(list)
          .getAllByRole("listitem")
          .map((row) => row.textContent)
      : [];
  }

  it("stores all carried wood and shows it in the storehouse", async () => {
    const stored: GameState = { ...AT_STOREHOUSE, inventory: {}, storage: { wood: 3, stone: 7 } };
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_STOREHOUSE })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: stored })),
    });
    await renderReady(api);
    expect(inventoryRows()).toEqual(["Wood 3/5"]);

    await userEvent.click(screen.getByRole("button", { name: "Store Wood" }));

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "storehouse.store",
      payload: { item: "wood", quantity: 3 },
    });
    expect(inventoryRows()).toEqual([]);
    expect(storehouseRows()).toEqual(["Wood 3/100Take", "Stone 7/100Take"]);
  });

  it("takes as much stone as fits in the character's hands", async () => {
    const taken: GameState = {
      ...AT_STOREHOUSE,
      inventory: { wood: 3, stone: 5 },
      storage: { stone: 2 },
    };
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_STOREHOUSE })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: taken })),
    });
    await renderReady(api);

    await userEvent.click(screen.getByRole("button", { name: "Take Stone" }));

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "storehouse.take",
      payload: { item: "stone", quantity: 5 },
    });
    expect(inventoryRows()).toEqual(["Wood 3/5", "Stone 5/5"]);
    expect(storehouseRows()).toEqual(["Stone 2/100Take"]);
    expect(screen.getByRole("button", { name: "Take Stone" })).toBeDisabled();
  });

  it("explains a hands_full refusal", async () => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_STOREHOUSE })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "hands_full" as const })),
    });
    await renderReady(api);

    await userEvent.click(screen.getByRole("button", { name: "Take Stone" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your hands are full (5 max). Store some in the storehouse.",
    );
    expect(inventoryRows()).toEqual(["Wood 3/5"]);
  });

  it("explains a not_at_storehouse refusal", async () => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: AT_STOREHOUSE })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason: "not_at_storehouse" as const })),
    });
    await renderReady(api);
    await userEvent.click(screen.getByRole("button", { name: "Store Wood" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stand next to the storehouse and face it.",
    );
  });

  it("highlights the storehouse panel when the game says the character arrived", async () => {
    const { props } = await renderReady();
    const panel = screen.getByRole("region", { name: "Storehouse" });
    expect(panel).not.toHaveClass("highlighted");
    act(() => props.openStorehouse());
    expect(panel).toHaveClass("highlighted");
  });

  it("reopens the storehouse panel if it was closed when the character arrives", async () => {
    const { props } = await renderReady();
    await userEvent.click(screen.getByRole("button", { name: "Storehouse" }));
    expect(screen.queryByRole("region", { name: "Storehouse" })).not.toBeInTheDocument();
    act(() => props.openStorehouse());
    expect(screen.getByRole("region", { name: "Storehouse" })).toHaveClass("highlighted");
  });
});

describe("GameScreen villagers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The villagers sit in a dropdown over the map; open it as a player would. */
  async function openVillagers() {
    await userEvent.click(screen.getByRole("button", { name: /Villagers/ }));
  }

  function latest() {
    const props = canvas.props;
    if (!props) throw new Error("GameCanvas was not rendered");
    return props;
  }

  const IDLE: GameState = {
    ...ALICE_STATE,
    storage: { rake: 1 },
    villagers: [
      { id: "v1", name: "Aldric", task: null },
      { id: "v2", name: "Maud", task: null },
    ],
  };

  function working(since: number): GameState {
    return {
      ...IDLE,
      villagers: [
        { id: "v1", name: "Aldric", task: null },
        {
          id: "v2",
          name: "Maud",
          task: { kind: "gather", nodeId: "heartland_tree", since, delivered: 0 },
        },
      ],
    };
  }

  it("lists the villagers and hands them to the game", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: IDLE })) });
    await renderReady(api);
    await openVillagers();
    expect(latest().villagers).toEqual(IDLE.villagers);
    const panel = screen.getByRole("region", { name: "Villagers" });
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Aldric"), expect.stringContaining("Maud")]);
  });

  it("sends villager.assign and shows the new job", async () => {
    const assigned = working(Date.now());
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: IDLE })),
      sendAction: vi.fn(async () => ({ ok: true as const, value: assigned })),
    });
    await renderReady(api);
    await openVillagers();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Job for Maud" }),
      "Gather wood",
    );

    expect(api.sendAction).toHaveBeenCalledWith({
      type: "villager.assign",
      payload: { villagerId: "v2", job: "wood" },
    });
    expect(screen.getByRole("combobox", { name: "Job for Maud" })).toHaveValue("wood");
    expect(screen.getByRole("region", { name: "Villagers" })).toHaveTextContent(
      "Maud Gathering wood",
    );
    expect(latest().villagers).toEqual(assigned.villagers);
  });

  it.each([
    [
      "no_rake_in_storehouse",
      "Put a rake in the storehouse first — each farming villager needs one.",
    ],
    ["no_field", "That field is gone."],
    ["no_villager", "That villager isn't here."],
  ] as const)("explains a %s refusal", async (reason, message) => {
    const api = fakeApi({
      getState: vi.fn(async () => ({ ok: true as const, value: IDLE })),
      sendAction: vi.fn(async () => ({ ok: false as const, reason })),
    });
    await renderReady(api);
    await openVillagers();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Job for Aldric" }),
      "Harvest wheat",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("combobox", { name: "Job for Aldric" })).toHaveValue("idle");
  });

  it("re-reads state when a working villager's delivery is due, so the storehouse fills", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const since = Date.now();
    const started = working(since);
    const t = taskTimeline(
      { kind: "gather", nodeId: "heartland_tree", since, delivered: 0 },
      RESOURCE_NODES.heartland_tree,
    );
    const firstAt = t.outbound + t.cycle - t.leg;
    const delivered: GameState = {
      ...started,
      storage: { rake: 1, wood: 5 },
      villagers: started.villagers.map((v) =>
        v.task ? { ...v, task: { ...v.task, delivered: 1 } } : v,
      ),
    };
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: started })) });
    await renderReady(api);
    await openVillagers();
    expect(api.getState).toHaveBeenCalledTimes(1);
    vi.mocked(api.getState).mockResolvedValue({ ok: true, value: delivered });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(firstAt + JOB_SETTLE_MS - 2_000);
    });
    expect(api.getState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(api.getState).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("region", { name: "Storehouse" })).toHaveTextContent("Wood");
  });

  it("doesn't poll while every villager is idle", async () => {
    const api = fakeApi({ getState: vi.fn(async () => ({ ok: true as const, value: IDLE })) });
    await renderReady(api);
    await openVillagers();
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(api.getState).toHaveBeenCalledTimes(1);
  });
});
