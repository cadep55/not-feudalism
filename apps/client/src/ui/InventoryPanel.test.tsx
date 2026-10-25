import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InventoryPanel } from "./InventoryPanel.tsx";

describe("InventoryPanel", () => {
  it("says it's empty and how to fill it", () => {
    render(<InventoryPanel inventory={{}} job={null} />);
    expect(screen.getByText("Empty — click a tree or rock to gather.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists each item the character has with its count out of the carry limit", () => {
    render(<InventoryPanel inventory={{ stone: 2, wood: 3, wheat: 0 }} job={null} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Wood 3/5", "Stone 2/5"]);
    expect(rows[0]?.querySelector(".count")).toHaveTextContent("3/5");
    expect(within(rows[0] as HTMLElement).getByText("Wood")).toBeInTheDocument();
    expect(screen.queryByText(/Empty/)).not.toBeInTheDocument();
  });

  it("marks items the character can't carry more of", () => {
    render(<InventoryPanel inventory={{ wood: 5, stone: 1 }} job={null} />);
    const [wood, stone] = screen.getAllByRole("listitem");
    expect(wood).toHaveTextContent("Wood 5/5");
    expect(wood).toHaveClass("full");
    expect(stone).not.toHaveClass("full");
  });

  it("shows what is being gathered", () => {
    render(
      <InventoryPanel
        inventory={{}}
        job={{ kind: "gather", nodeId: "heartland_tree", startedAt: 0, completesAt: 3_000 }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Gathering wood…");
  });

  it("shows a wheat harvest in progress", () => {
    render(
      <InventoryPanel
        inventory={{}}
        job={{ kind: "harvest", fieldId: "heartland:13,14", startedAt: 0, completesAt: 3_000 }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Harvesting wheat…");
  });

  it("lists wheat seeds like any other item", () => {
    render(<InventoryPanel inventory={{ wheat: 4, wheat_seeds: 1 }} job={null} />);
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Wheat 4/5",
      "Wheat seeds 1/5",
    ]);
  });

  it("leaves crafting status to the crafting panel", () => {
    render(
      <InventoryPanel
        inventory={{}}
        job={{ kind: "craft", recipeId: "rake", startedAt: 0, completesAt: 3_000 }}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
