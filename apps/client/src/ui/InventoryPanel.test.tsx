import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InventoryPanel } from "./InventoryPanel.tsx";

describe("InventoryPanel", () => {
  it("says it's empty and how to fill it", () => {
    render(<InventoryPanel inventory={{}} job={null} />);
    expect(screen.getByText("Empty — click a tree or rock to gather.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists each item the character has with its count", () => {
    render(<InventoryPanel inventory={{ stone: 2, wood: 3, wheat: 0 }} job={null} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Wood3", "Stone2"]);
    expect(within(rows[0] as HTMLElement).getByText("Wood")).toBeInTheDocument();
    expect(screen.queryByText(/Empty/)).not.toBeInTheDocument();
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
});
