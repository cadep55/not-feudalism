import {
  BUILD_COSTS,
  BUILDING_KINDS,
  BUILDING_LIMITS,
  type Building,
  type BuildingKind,
  hasItems,
  type Inventory,
  ITEMS,
  type ItemId,
  type Job,
} from "@nf/shared";

type Props = {
  inventory: Inventory;
  buildings: Building[];
  job: Job | null;
  /** The kind being placed on the map, or null when not placing. */
  placing: BuildingKind | null;
  onPlace: (kind: BuildingKind | null) => void;
  onRemove: (buildingId: string) => void;
};

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  house: "House",
  storehouse: "Storehouse",
};

/**
 * Each kind of building with its cost against what the character carries,
 * how many they have out of the limit, and a button to place one on the map.
 * Below, the buildings they have, each with a Remove button (the last house
 * and storehouse can't be removed).
 */
export function BuildPanel({ inventory, buildings, job, placing, onPlace, onRemove }: Props) {
  const count = (kind: BuildingKind) => buildings.filter((b) => b.kind === kind).length;
  return (
    <section className="panel build" aria-labelledby="build-title">
      <h2 id="build-title">Build</h2>
      {placing ? (
        <p className="working" role="status">
          Click the map to place the {BUILDING_NAMES[placing].toLowerCase()}. It needs open grass
          with a clear tile on every side.{" "}
          <button type="button" onClick={() => onPlace(null)}>
            Cancel
          </button>
        </p>
      ) : (
        <ul className="recipes">
          {BUILDING_KINDS.map((kind) => {
            const name = BUILDING_NAMES[kind];
            const cost = BUILD_COSTS[kind];
            const have = count(kind);
            const atLimit = have >= BUILDING_LIMITS[kind];
            const canBuild = job === null && !atLimit && hasItems(inventory, cost);
            return (
              <li key={kind} className="recipe">
                <h3>
                  {name}{" "}
                  <span className="count">
                    {have}/{BUILDING_LIMITS[kind]}
                  </span>
                </h3>
                <ul aria-label={`${name} needs`}>
                  {Object.entries(cost).map(([item, need = 0]) => {
                    const held = inventory[item as ItemId] ?? 0;
                    const missing = held < need;
                    return (
                      <li key={item} className={missing ? "missing" : undefined}>
                        <span>{ITEMS[item as ItemId].name}</span>{" "}
                        <span className="count">
                          {held}/{need}
                          {missing && <span className="visually-hidden"> (not enough)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  aria-label={`Build ${name}`}
                  disabled={!canBuild}
                  onClick={() => onPlace(kind)}
                >
                  Build
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {job?.kind === "build" && (
        <p className="working" role="status">
          Building a {BUILDING_NAMES[job.building.kind].toLowerCase()}…
        </p>
      )}
      {job?.kind === "remove" && (
        <p className="working" role="status">
          Removing a {BUILDING_NAMES[job.building.kind].toLowerCase()}…
        </p>
      )}
      <h3>Your buildings</h3>
      <ul aria-label="Your buildings">
        {buildings.map((building) => {
          const name = BUILDING_NAMES[building.kind];
          const last = count(building.kind) <= 1;
          return (
            <li key={building.id}>
              <span>
                {name}{" "}
                <span className="count">
                  at {building.x},{building.y}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${name} at ${building.x},${building.y}`}
                title={last ? `You can't remove your last ${name.toLowerCase()}.` : undefined}
                disabled={last || job !== null}
                onClick={() => onRemove(building.id)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
