import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FarmingPanel } from "./FarmingPanel.tsx";

describe("FarmingPanel", () => {
  it("can't plant without seeds, and says where seeds come from", () => {
    render(<FarmingPanel inventory={{ wheat: 3 }} job={null} onPlant={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Farming" })).toHaveTextContent("Wheat seeds: 0");
    expect(screen.getByRole("button", { name: "Plant seed" })).toBeDisabled();
    expect(screen.getByText("Harvest wheat fields with a rake to find seeds.")).toBeInTheDocument();
  });

  it("plants a seed on the tile in front when clicked", async () => {
    const onPlant = vi.fn();
    render(<FarmingPanel inventory={{ wheat_seeds: 2 }} job={null} onPlant={onPlant} />);
    const button = screen.getByRole("button", { name: "Plant seed" });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription("Plants on the tile in front of you.");
    expect(button).toHaveAttribute("title", "Plants on the tile in front of you");
    expect(screen.getByRole("region", { name: "Farming" })).toHaveTextContent("Wheat seeds: 2");

    await userEvent.click(button);
    expect(onPlant).toHaveBeenCalledTimes(1);
  });

  it("can't plant while busy with a job", () => {
    render(
      <FarmingPanel
        inventory={{ wheat_seeds: 1 }}
        job={{ kind: "harvest", fieldId: "heartland:13,14", startedAt: 0, completesAt: 3_000 }}
        onPlant={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Plant seed" })).toBeDisabled();
  });
});
