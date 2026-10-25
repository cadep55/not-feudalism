import type { Inventory, Job } from "@nf/shared";

type Props = {
  inventory: Inventory;
  job: Job | null;
  onPlant: () => void;
};

/**
 * Planting wheat: one seed makes a new field on the grass tile in front of the
 * character (the faint arrow shows which). The server checks the tile.
 */
export function FarmingPanel({ inventory, job, onPlant }: Props) {
  const seeds = inventory.wheat_seeds ?? 0;
  const canPlant = seeds > 0 && job === null;
  return (
    <section className="panel farming" aria-labelledby="farming-title">
      <h2 id="farming-title">Farming</h2>
      <p className="seeds">
        Wheat seeds: <span className="count">{seeds}</span>
      </p>
      <button
        type="button"
        disabled={!canPlant}
        onClick={onPlant}
        title="Plants on the tile in front of you"
        aria-describedby="farming-hint"
      >
        Plant seed
      </button>
      <p id="farming-hint" className="hint-small">
        {seeds > 0
          ? "Plants on the tile in front of you."
          : "Harvest wheat fields with a rake to find seeds."}
      </p>
    </section>
  );
}
