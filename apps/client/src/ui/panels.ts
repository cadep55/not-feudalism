/** The panels in the bottom bar, left to right. */
export const PANEL_IDS = ["inventory", "crafting", "farming", "storehouse"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_LABELS: Record<PanelId, string> = {
  inventory: "Inventory",
  crafting: "Crafting",
  farming: "Farming",
  storehouse: "Storehouse",
};

const STORAGE_KEY = "nf.openPanels";

/** Opens a closed panel or closes an open one, keeping the bar's left-to-right order. */
export function togglePanel(open: readonly PanelId[], id: PanelId): PanelId[] {
  const next = open.includes(id) ? open.filter((p) => p !== id) : [...open, id];
  return PANEL_IDS.filter((p) => next.includes(p));
}

/** Makes sure a panel is open (e.g. the storehouse when the player walks up to it). */
export function ensureOpen(open: readonly PanelId[], id: PanelId): PanelId[] {
  return open.includes(id) ? [...open] : togglePanel(open, id);
}

/**
 * Which panels were open last time. Every panel is open the first time, or if
 * the browser won't let us read storage (private windows, previews).
 */
export function loadOpenPanels(storage: Pick<Storage, "getItem"> | undefined): PanelId[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return [...PANEL_IDS];
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return [...PANEL_IDS];
    return PANEL_IDS.filter((id) => saved.includes(id));
  } catch {
    return [...PANEL_IDS];
  }
}

/** Remembers which panels are open; silently does nothing if storage is unavailable. */
export function saveOpenPanels(
  storage: Pick<Storage, "setItem"> | undefined,
  open: PanelId[],
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(open));
  } catch {
    // A convenience only: the bar still works without it.
  }
}

/** The browser's localStorage, or undefined where touching it throws. */
export function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
