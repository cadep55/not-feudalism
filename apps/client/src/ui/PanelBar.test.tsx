import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PanelBar } from "./PanelBar.tsx";
import { PANEL_IDS, type PanelId, togglePanel } from "./panels.ts";

function Harness({ initial = [...PANEL_IDS] }: { initial?: PanelId[] }) {
  const [open, setOpen] = useState<PanelId[]>(initial);
  return (
    <PanelBar
      open={open}
      onToggle={(id) => setOpen((o) => togglePanel(o, id))}
      panels={{
        inventory: <section aria-label="Inventory">inv</section>,
        crafting: <section aria-label="Crafting">craft</section>,
        farming: <section aria-label="Farming">farm</section>,
        storehouse: <section aria-label="Storehouse">store</section>,
      }}
    />
  );
}

describe("PanelBar", () => {
  it("shows a pressed tab and the panel for each open panel", () => {
    render(<Harness />);
    for (const name of ["Inventory", "Crafting", "Farming", "Storehouse"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("closes and reopens panels with the tabs, keeping their order", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Crafting" }));
    expect(screen.queryByRole("region", { name: "Crafting" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crafting" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(screen.getByRole("button", { name: "Crafting" }));
    const order = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(order).toEqual(["Inventory", "Crafting", "Farming", "Storehouse"]);
  });

  it("tells the row how many panels share the width", async () => {
    const { container } = render(<Harness initial={["inventory", "farming"]} />);
    expect(container.querySelector(".panel-row")).toHaveAttribute("data-open", "2");
  });

  it("says how to get panels back when all are closed", () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(/All panels are closed/)).toBeInTheDocument();
  });
});
