import type { Job } from "@nf/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CraftingPanel } from "./CraftingPanel.tsx";

const CRAFTING: Job = { kind: "craft", recipeId: "rake", startedAt: 0, completesAt: 3_000 };
const GATHERING: Job = {
  kind: "gather",
  nodeId: "heartland_tree",
  startedAt: 0,
  completesAt: 3_000,
};

function rakeInputs() {
  return within(screen.getByRole("list", { name: "Rake needs" })).getAllByRole("listitem");
}

describe("CraftingPanel", () => {
  it("lists the rake with what it needs against what the character has", () => {
    render(<CraftingPanel inventory={{ wood: 1 }} job={null} onCraft={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Rake" })).toBeInTheDocument();
    const [wood, stone] = rakeInputs();
    expect(wood).toHaveTextContent("Wood 1/2 (not enough)");
    expect(wood).toHaveClass("missing");
    expect(stone).toHaveTextContent("Stone 0/1 (not enough)");
    expect(stone).toHaveClass("missing");
  });

  it("puts a space between the item and its count", () => {
    render(<CraftingPanel inventory={{}} job={null} onCraft={vi.fn()} />);
    const [wood] = rakeInputs();
    expect(wood?.textContent).toMatch(/^Wood 0\/2/);
  });

  it("doesn't mark inputs the character has enough of", () => {
    render(<CraftingPanel inventory={{ wood: 5, stone: 0 }} job={null} onCraft={vi.fn()} />);
    const [wood, stone] = rakeInputs();
    expect(wood).toHaveTextContent("Wood 5/2");
    expect(wood).not.toHaveTextContent("not enough");
    expect(wood).not.toHaveClass("missing");
    expect(stone).toHaveClass("missing");
  });

  it("disables Craft when materials are short", () => {
    render(<CraftingPanel inventory={{ wood: 2 }} job={null} onCraft={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Craft Rake" })).toBeDisabled();
  });

  it("enables Craft with 2 wood and 1 stone, and crafts the rake on click", async () => {
    const onCraft = vi.fn();
    render(<CraftingPanel inventory={{ wood: 2, stone: 1 }} job={null} onCraft={onCraft} />);
    const button = screen.getByRole("button", { name: "Craft Rake" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onCraft).toHaveBeenCalledWith("rake");
  });

  it("disables Craft while any job runs", () => {
    const inventory = { wood: 4, stone: 2 };
    const { rerender } = render(
      <CraftingPanel inventory={inventory} job={GATHERING} onCraft={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Craft Rake" })).toBeDisabled();
    // Gathering status belongs to the inventory panel.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<CraftingPanel inventory={inventory} job={CRAFTING} onCraft={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Craft Rake" })).toBeDisabled();
  });

  it("shows what is being crafted", () => {
    render(<CraftingPanel inventory={{}} job={CRAFTING} onCraft={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Crafting rake…");
  });
});
