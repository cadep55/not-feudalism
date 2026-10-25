import type { Villager } from "@nf/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VillagersMenu } from "./VillagersMenu.tsx";

const VILLAGERS: Villager[] = [
  { id: "v1", name: "Aldric", task: null },
  {
    id: "v2",
    name: "Maud",
    task: { kind: "gather", nodeId: "heartland_tree", since: 0, delivered: 0 },
  },
];

describe("VillagersMenu", () => {
  it("starts closed, showing how many villagers are working", () => {
    render(<VillagersMenu villagers={VILLAGERS} onAssign={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Villagers \(1\/2 working\)/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Villagers" })).not.toBeInTheDocument();
  });

  it("opens to the villagers and their job selectors, and closes again", async () => {
    const onAssign = vi.fn();
    render(<VillagersMenu villagers={VILLAGERS} onAssign={onAssign} />);
    const button = screen.getByRole("button", { name: /Villagers/ });

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Job for Aldric" }),
      "stone",
    );
    expect(onAssign).toHaveBeenCalledWith("v1", "stone");

    await userEvent.click(button);
    expect(screen.queryByRole("region", { name: "Villagers" })).not.toBeInTheDocument();
  });
});
