import {
  atStorehouse,
  type Direction,
  type GameState,
  type ItemId,
  isRegionId,
  type NodeId,
  REGIONS,
  type RecipeId,
  type VillagerJob,
} from "@nf/shared";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import type { MoveOutcome } from "../game/createGame.ts";
import { GameCanvas } from "../game/GameCanvas.tsx";
import { refreshDelay } from "../game/gathering.ts";
import type { Tile } from "../game/movement.ts";
import { nextVillagerRefresh } from "../game/villagers.ts";
import type { Api, Player } from "../net/api.ts";
import { CraftingPanel } from "./CraftingPanel.tsx";
import { FarmingPanel } from "./FarmingPanel.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { FAILURE_MESSAGES } from "./messages.ts";
import { PanelBar } from "./PanelBar.tsx";
import {
  browserStorage,
  loadOpenPanels,
  type PanelId,
  saveOpenPanels,
  togglePanel,
} from "./panels.ts";
import { StorehouseOverlay } from "./StorehouseOverlay.tsx";
import { VillagersMenu } from "./VillagersMenu.tsx";

/** How long a refusal message stays on screen. */
export const NOTICE_MS = 2_500;

type Props = {
  api: Api;
  player: Player;
  onLogOut: () => void;
};

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; state: GameState };

export function GameScreen({ api, player, onLogOut }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [storehouseOpen, setStorehouseOpen] = useState(false);
  const [openPanels, setOpenPanels] = useState<PanelId[]>(() => loadOpenPanels(browserStorage()));
  useEffect(() => saveOpenPanels(browserStorage(), openPanels), [openPanels]);
  const toggle = useCallback((id: PanelId) => setOpenPanels((open) => togglePanel(open, id)), []);
  const showState = useCallback((state: GameState) => setLoad({ status: "ready", state }), []);

  useEffect(() => {
    let cancelled = false;
    api.getState().then((result) => {
      if (cancelled) return;
      if (result.ok) showState(result.value);
      else setLoad({ status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [api, showState]);

  // Jobs finish on the server lazily: once the timer is up, read state to collect the result.
  const job = load.status === "ready" ? load.state.job : null;
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        api.getState().then((result) => {
          if (!cancelled && result.ok) showState(result.value);
        });
      },
      refreshDelay(job, Date.now()),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, job, showState]);

  // Villager deliveries reach the storehouse when the server settles (on any read or action).
  // While any villager works, re-read state just after its next delivery is due; never when all
  // are idle. Every new state (including this re-read) reschedules from the timeline.
  const ready = load.status === "ready" ? load.state : null;
  useEffect(() => {
    if (!ready) return;
    const delay = nextVillagerRefresh(ready, Date.now());
    if (delay === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.getState().then((result) => {
        if (!cancelled && result.ok) showState(result.value);
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, ready, showState]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // The storehouse overlay closes by itself once the player walks away or turns from it.
  const atTheStorehouse = load.status === "ready" && atStorehouse(load.state);
  useEffect(() => {
    if (storehouseOpen && !atTheStorehouse) setStorehouseOpen(false);
  }, [storehouseOpen, atTheStorehouse]);
  const closeStorehouse = useCallback(() => setStorehouseOpen(false), []);

  const sendPosition = useCallback(
    async (tile: Tile): Promise<MoveOutcome> => {
      const result = await api.sendAction({ type: "move.to", payload: tile });
      // The reply carries the job too: walking away cancels a gather (a craft keeps going).
      if (result.ok) {
        showState(result.value);
        return { ok: true, facing: result.value.character.facing };
      }
      // A network blip isn't a refusal: keep walking, the next update carries a newer position.
      if (result.reason === "network_error") return { ok: true, facing: null };
      const truth = await api.getState();
      if (truth.ok) showState(truth.value);
      const position = truth.ok ? { x: truth.value.character.x, y: truth.value.character.y } : tile;
      const facing = truth.ok ? truth.value.character.facing : null;
      return { ok: false, position, facing, message: FAILURE_MESSAGES[result.reason] };
    },
    [api, showState],
  );

  const startGather = useCallback(
    async (nodeId: NodeId) => {
      const result = await api.sendAction({ type: "gather.start", payload: { nodeId } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );

  // Harvesting a field works like gathering: the wheat (and maybe a seed) arrives when the job ends.
  const startHarvest = useCallback(
    async (fieldId: string) => {
      const result = await api.sendAction({ type: "field.harvest", payload: { fieldId } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );

  // Planting is instant: the reply carries one seed fewer and the new, growing field.
  const plant = useCallback(async () => {
    const result = await api.sendAction({ type: "field.plant", payload: {} });
    if (result.ok) {
      showState(result.value);
      setNotice(null);
    } else {
      setNotice(FAILURE_MESSAGES[result.reason]);
    }
  }, [api, showState]);

  // Turning in place, e.g. to face a node before gathering at it.
  const turn = useCallback(
    async (facing: Direction): Promise<boolean> => {
      const result = await api.sendAction({ type: "turn", payload: { facing } });
      if (result.ok) {
        showState(result.value);
        return true;
      }
      setNotice(FAILURE_MESSAGES[result.reason]);
      return false;
    },
    [api, showState],
  );

  // Materials leave the inventory as soon as the server accepts; the item arrives when the job ends.
  const startCraft = useCallback(
    async (recipeId: RecipeId) => {
      const result = await api.sendAction({ type: "craft.start", payload: { recipeId } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );

  // Moving items between hands and storehouse is instant: the reply carries both inventories.
  const transfer = useCallback(
    async (type: "storehouse.store" | "storehouse.take", item: ItemId, quantity: number) => {
      const result = await api.sendAction({ type, payload: { item, quantity } });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );
  const store = useCallback(
    (item: ItemId, quantity: number) => transfer("storehouse.store", item, quantity),
    [transfer],
  );
  const take = useCallback(
    (item: ItemId, quantity: number) => transfer("storehouse.take", item, quantity),
    [transfer],
  );
  // Assigning is instant: the reply carries the villager's task (and the storehouse, for rakes).
  const assignVillager = useCallback(
    async (villagerId: string, job: VillagerJob) => {
      const result = await api.sendAction({
        type: "villager.assign",
        payload: { villagerId, job },
      });
      if (result.ok) {
        showState(result.value);
        setNotice(null);
      } else {
        setNotice(FAILURE_MESSAGES[result.reason]);
      }
    },
    [api, showState],
  );
  // Walking up to the storehouse (and facing it) opens it over the map.
  const openStorehouse = useCallback(() => setStorehouseOpen(true), []);

  return (
    <div className="game">
      <header>
        <span>
          Playing as <strong>{player.characterName}</strong>
        </span>
        <button type="button" onClick={onLogOut}>
          Log out
        </button>
      </header>
      {load.status === "loading" && <p className="status">Loading your world…</p>}
      {load.status === "error" && (
        <p role="alert" className="status error">
          {FAILURE_MESSAGES.network_error}
        </p>
      )}
      {load.status === "ready" && (
        <>
          <div className="map-area">
            <div className="map" style={mapShape(load.state.character.region)}>
              <GameCanvas
                character={load.state.character}
                job={load.state.job}
                fields={load.state.fields}
                villagers={load.state.villagers}
                buildings={load.state.buildings}
                sendPosition={sendPosition}
                startGather={startGather}
                startHarvest={startHarvest}
                turn={turn}
                openStorehouse={openStorehouse}
              />
              <VillagersMenu villagers={load.state.villagers} onAssign={assignVillager} />
              {storehouseOpen && (
                <StorehouseOverlay
                  state={load.state}
                  onStore={store}
                  onTake={take}
                  onClose={closeStorehouse}
                />
              )}
            </div>
          </div>
          {notice && (
            <p role="alert" className="notice">
              {notice}
            </p>
          )}
          <p className="hint">
            Click a tile to walk there, or use the arrow keys / WASD. Click a tree or rock to
            gather, a wheat field to harvest it, or the storehouse to store and take items.
          </p>
          <PanelBar
            open={openPanels}
            onToggle={toggle}
            panels={{
              inventory: <InventoryPanel inventory={load.state.inventory} job={load.state.job} />,
              crafting: (
                <CraftingPanel
                  inventory={load.state.inventory}
                  job={load.state.job}
                  onCraft={startCraft}
                />
              ),
              farming: (
                <FarmingPanel
                  inventory={load.state.inventory}
                  job={load.state.job}
                  onPlant={plant}
                />
              ),
            }}
          />
        </>
      )}
    </div>
  );
}

/** The map's width-to-height ratio, so the page can size it as large as fits. */
function mapShape(region: string): CSSProperties {
  if (!isRegionId(region)) return {};
  const { width, height } = REGIONS[region];
  return { "--map-ratio": width / height } as CSSProperties;
}
