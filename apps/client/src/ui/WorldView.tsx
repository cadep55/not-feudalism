import { REGION_IDS, REGIONS, type RegionId, type WorldOverview } from "@nf/shared";
import { useEffect } from "react";

type Props = {
  /** Null while it loads. */
  world: WorldOverview | null;
  onClose: () => void;
};

const COLS = Math.max(...REGION_IDS.map((id) => REGIONS[id].col)) + 1;
const ROWS = Math.max(...REGION_IDS.map((id) => REGIONS[id].row)) + 1;

/** Each water rectangle as a share of its section, so the world view can shade it. */
function waterStyles(id: RegionId) {
  const { width, height, water } = REGIONS[id];
  return water.map((rect) => ({
    left: `${(rect.x / width) * 100}%`,
    top: `${(rect.y / height) * 100}%`,
    width: `${(rect.width / width) * 100}%`,
    height: `${(rect.height / height) * 100}%`,
  }));
}

/** What a section's card says about who lives there. */
function ownerText(id: RegionId, world: WorldOverview): string {
  if (id === world.home) return "Your home";
  const owner = world.owners[id];
  if (owner) return owner;
  return REGIONS[id].reachable ? "Free" : "Needs a boat";
}

/**
 * The zoomed-out world: every section as a rectangle on the world grid,
 * water shaded, with who calls it home and where the player stands. Look
 * only for now. Closes with the ✕ button or Esc.
 */
export function WorldView({ world, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="map-overlay world-overlay panel" aria-labelledby="world-title">
      <button type="button" className="overlay-close" aria-label="Close world" onClick={onClose}>
        ✕
      </button>
      <h2 id="world-title">World</h2>
      {world === null ? (
        <p className="empty">Loading the world…</p>
      ) : (
        <ol
          className="world-grid"
          aria-label="Sections"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {REGION_IDS.map((id) => {
            const section = REGIONS[id];
            const here = id === world.here;
            const classes = [
              "world-section",
              id === world.home ? "home" : "",
              here ? "here" : "",
              section.reachable ? "" : "unreachable",
            ];
            return (
              <li
                key={id}
                className={classes.filter(Boolean).join(" ")}
                style={{ gridColumn: section.col + 1, gridRow: section.row + 1 }}
              >
                {waterStyles(id).map((style) => (
                  <span key={`${style.left},${style.top}`} className="world-water" style={style} />
                ))}
                <span className="world-name">{section.name}</span>
                <span className="world-owner">{ownerText(id, world)}</span>
                {here && <span className="world-here">You are here</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
