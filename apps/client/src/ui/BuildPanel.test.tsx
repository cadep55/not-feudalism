import { type Building, type Job, STARTING_BUILDINGS, STARTING_HOUSE } from "@nf/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BuildPanel } from "./BuildPanel.tsx";

const SECOND_HOUSE: Building = { ...STARTING_HOUSE, id: "house_2", x: 20, y: 13 };

function renderPanel(
  props: Partial<{
    inventory: Record<string, number>;
    buildings: Building[];
    job: Job | null;
    placing: "house" | "storehouse" | null;
  }> = {},
) {
  const onPlace = vi.fn();
  const onRemove = vi.fn();
  render(
    <BuildPanel
      inventory={props.inventory ?? {}}
      buildings={props.buildings ?? [...STARTING_BUILDINGS]}
      job={props.job ?? null}
      placing={props.placing ?? null}
      onPlace={onPlace}
      onRemove={onRemove}
    />,
  );
  return { onPlace, onRemove };
}

describe("BuildPanel", () => {
  it("lists each building's cost against what's carried, and how many out of the limit", () => {
    renderPanel({ inventory: { wood: 3 } });
    const house = within(screen.getByRole("list", { name: "House needs" }));
    expect(house.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Wood 3/5 (not enough)",
    ]);
    const store = within(screen.getByRole("list", { name: "Storehouse needs" }));
    expect(store.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Wood 3/5 (not enough)",
      "Stone 0/5 (not enough)",
    ]);
    expect(screen.getByRole("heading", { name: "House 1/5" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Storehouse 1/3" })).toBeInTheDocument();
  });

  it("enters placement mode when the materials are there", async () => {
    const { onPlace } = renderPanel({ inventory: { wood: 5 } });
    expect(screen.getByRole("button", { name: "Build Storehouse" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Build House" }));
    expect(onPlace).toHaveBeenCalledWith("house");
  });

  it("can't build while busy or at the limit", () => {
    const busy: Job = { kind: "craft", recipeId: "rake", startedAt: 0, completesAt: 1 };
    renderPanel({ inventory: { wood: 5 }, job: busy });
    expect(screen.getByRole("button", { name: "Build House" })).toBeDisabled();
  });

  it("disables Build at the limit", () => {
    const houses = [1, 2, 3, 4].map((n) => ({ ...SECOND_HOUSE, id: `h${n}`, x: n * 3 }));
    renderPanel({ inventory: { wood: 5 }, buildings: [...STARTING_BUILDINGS, ...houses] });
    expect(screen.getByRole("heading", { name: "House 5/5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build House" })).toBeDisabled();
  });

  it("while placing, explains how and offers Cancel", async () => {
    const { onPlace } = renderPanel({ placing: "storehouse" });
    expect(screen.getByRole("status")).toHaveTextContent("Click the map to place the storehouse");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onPlace).toHaveBeenCalledWith(null);
  });

  it("removes buildings, but never the last of a kind", async () => {
    const { onRemove } = renderPanel({ buildings: [...STARTING_BUILDINGS, SECOND_HOUSE] });
    expect(screen.getByRole("button", { name: "Remove Storehouse at 15,8" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove House at 20,13" }));
    expect(onRemove).toHaveBeenCalledWith("house_2");
  });

  it("says what it's building or removing", () => {
    const job: Job = { kind: "build", building: SECOND_HOUSE, startedAt: 0, completesAt: 1 };
    renderPanel({ job });
    expect(screen.getByRole("status")).toHaveTextContent("Building a house…");
  });
});
