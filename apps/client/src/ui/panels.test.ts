import { describe, expect, it } from "vitest";
import { loadOpenPanels, PANEL_IDS, saveOpenPanels, togglePanel } from "./panels.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("togglePanel", () => {
  it("closes an open panel and reopens it in its usual place", () => {
    const closed = togglePanel(PANEL_IDS, "crafting");
    expect(closed).toEqual(["inventory", "farming"]);
    expect(togglePanel(closed, "crafting")).toEqual(["inventory", "crafting", "farming"]);
  });

  it("can close every panel", () => {
    let open = [...PANEL_IDS];
    for (const id of PANEL_IDS) open = togglePanel(open, id);
    expect(open).toEqual([]);
  });
});

describe("remembering open panels", () => {
  it("opens everything the first time", () => {
    expect(loadOpenPanels(memoryStorage())).toEqual([...PANEL_IDS]);
    expect(loadOpenPanels(undefined)).toEqual([...PANEL_IDS]);
  });

  it("round-trips the open panels", () => {
    const storage = memoryStorage();
    saveOpenPanels(storage, ["farming", "inventory"]);
    expect(loadOpenPanels(storage)).toEqual(["inventory", "farming"]);
  });

  it("ignores junk and unknown panels", () => {
    expect(loadOpenPanels(memoryStorage({ "nf.openPanels": "{not json" }))).toEqual([...PANEL_IDS]);
    expect(loadOpenPanels(memoryStorage({ "nf.openPanels": '"inventory"' }))).toEqual([
      ...PANEL_IDS,
    ]);
    expect(loadOpenPanels(memoryStorage({ "nf.openPanels": '["storehouse","crafting"]' }))).toEqual(
      ["crafting"],
    );
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadOpenPanels(broken)).toEqual([...PANEL_IDS]);
    expect(() => saveOpenPanels(broken, [])).not.toThrow();
  });
});
