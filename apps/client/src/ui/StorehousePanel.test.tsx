import type { GameState } from "@nf/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALICE_STATE } from "../test-helpers.ts";
import { StorehousePanel } from "./StorehousePanel.tsx";

/** Beside the storehouse at (15, 8) and facing it. */
function atStorehouse(state: Partial<GameState> = {}): GameState {
  return {
    ...ALICE_STATE,
    character: { ...ALICE_STATE.character, x: 14, y: 8, facing: "e" },
    ...state,
  };
}

function renderPanel(state: GameState) {
  const onStore = vi.fn();
  const onTake = vi.fn();
  render(<StorehousePanel state={state} onStore={onStore} onTake={onTake} />);
  return { onStore, onTake };
}

describe("StorehousePanel", () => {
  it("shows the storehouse contents out of its limit", () => {
    renderPanel(atStorehouse({ storage: { wood: 12, stone: 3 } }));
    const rows = within(screen.getByRole("list", { name: "In the storehouse" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((row) => row.textContent)).toEqual(["Wood 12/100Take", "Stone 3/100Take"]);
  });

  it("says when nothing is stored", () => {
    renderPanel(atStorehouse());
    expect(screen.getByText("Nothing stored yet.")).toBeInTheDocument();
  });

  it("disables every button away from the storehouse, and says how to use it", () => {
    renderPanel({ ...ALICE_STATE, inventory: { wood: 2 }, storage: { stone: 4 } });
    expect(screen.getByRole("button", { name: "Store Wood" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Take Stone" })).toBeDisabled();
    expect(screen.getByText("Walk to the storehouse and face it to use it.")).toBeInTheDocument();
  });

  it("disables the buttons beside the storehouse when not facing it", () => {
    const state = atStorehouse({ inventory: { wood: 2 } });
    renderPanel({ ...state, character: { ...state.character, facing: "w" } });
    expect(screen.getByRole("button", { name: "Store Wood" })).toBeDisabled();
  });

  it("enables the buttons beside the storehouse and facing it", () => {
    renderPanel(atStorehouse({ inventory: { wood: 2 }, storage: { stone: 4 } }));
    expect(screen.getByRole("button", { name: "Store Wood" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Take Stone" })).toBeEnabled();
    expect(screen.queryByText(/Walk to the storehouse/)).not.toBeInTheDocument();
  });

  it("stores everything carried of an item", async () => {
    const { onStore } = renderPanel(atStorehouse({ inventory: { wood: 3, stone: 1 } }));
    await userEvent.click(screen.getByRole("button", { name: "Store Wood" }));
    expect(onStore).toHaveBeenCalledWith("wood", 3);
  });

  it("stores only what still fits in the storehouse", async () => {
    const { onStore } = renderPanel(
      atStorehouse({ inventory: { wood: 4 }, storage: { wood: 98 } }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Store Wood" }));
    expect(onStore).toHaveBeenCalledWith("wood", 2);
  });

  it("disables Store when the storehouse is full of that item", () => {
    renderPanel(atStorehouse({ inventory: { wood: 1 }, storage: { wood: 100 } }));
    expect(screen.getByRole("button", { name: "Store Wood" })).toBeDisabled();
  });

  it("takes as many as the character can carry", async () => {
    const { onTake } = renderPanel(atStorehouse({ inventory: { wood: 2 }, storage: { wood: 12 } }));
    await userEvent.click(screen.getByRole("button", { name: "Take Wood" }));
    expect(onTake).toHaveBeenCalledWith("wood", 3);
  });

  it("takes everything stored when it all fits", async () => {
    const { onTake } = renderPanel(atStorehouse({ storage: { stone: 2 } }));
    await userEvent.click(screen.getByRole("button", { name: "Take Stone" }));
    expect(onTake).toHaveBeenCalledWith("stone", 2);
  });

  it("disables Take when the character's hands are full of that item", () => {
    renderPanel(atStorehouse({ inventory: { wood: 5 }, storage: { wood: 10 } }));
    expect(screen.getByRole("button", { name: "Take Wood" })).toBeDisabled();
  });
});
