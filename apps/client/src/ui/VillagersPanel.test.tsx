import type { Villager } from "@nf/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VillagersPanel } from "./VillagersPanel.tsx";

const VILLAGERS: Villager[] = [
  { id: "v1", name: "Aldric", houseId: "heartland_house", task: null },
  {
    id: "v2",
    name: "Maud",
    houseId: "heartland_house",
    task: {
      kind: "gather",
      nodeId: "heartland_tree",
      storehouseId: "heartland_storehouse",
      since: 0,
      delivered: 0,
    },
  },
  {
    id: "v3",
    name: "Osric",
    houseId: "heartland_house",
    task: {
      kind: "harvest",
      fieldId: "heartland:13,14",
      storehouseId: "heartland_storehouse",
      since: 0,
      delivered: 0,
    },
  },
];

describe("VillagersPanel", () => {
  it("lists each villager with what it's doing", () => {
    render(<VillagersPanel villagers={VILLAGERS} onAssign={vi.fn()} />);
    const panel = screen.getByRole("region", { name: "Villagers" });
    const rows = within(panel).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Aldric Idle");
    expect(rows[1]).toHaveTextContent("Maud Gathering wood");
    expect(rows[2]).toHaveTextContent("Osric Harvesting wheat");
  });

  it("labels each dropdown and selects the current job", () => {
    render(<VillagersPanel villagers={VILLAGERS} onAssign={vi.fn()} />);
    const aldric = screen.getByRole("combobox", { name: "Job for Aldric" });
    expect(aldric).toHaveValue("idle");
    expect(screen.getByRole("combobox", { name: "Job for Maud" })).toHaveValue("wood");
    expect(screen.getByRole("combobox", { name: "Job for Osric" })).toHaveValue("wheat");
    expect(
      within(aldric)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Idle", "Gather wood", "Gather stone", "Harvest wheat"]);
  });

  it("sends the chosen job for that villager", async () => {
    const onAssign = vi.fn();
    render(<VillagersPanel villagers={VILLAGERS} onAssign={onAssign} />);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Job for Aldric" }),
      "Gather stone",
    );
    expect(onAssign).toHaveBeenCalledWith("v1", "stone");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Job for Osric" }), "Idle");
    expect(onAssign).toHaveBeenCalledWith("v3", "idle");
  });

  it("says so when nobody lives here", () => {
    render(<VillagersPanel villagers={[]} onAssign={vi.fn()} />);
    expect(screen.getByText("No villagers live here yet.")).toBeInTheDocument();
  });
});
