import {
  hasItems,
  type Inventory,
  ITEMS,
  type ItemId,
  type Job,
  RECIPE_IDS,
  RECIPES,
  type RecipeId,
} from "@nf/shared";

type Props = {
  inventory: Inventory;
  job: Job | null;
  onCraft: (recipeId: RecipeId) => void;
};

/** Every recipe with what it needs against what the character has, and a button to craft it. */
export function CraftingPanel({ inventory, job, onCraft }: Props) {
  return (
    <section className="panel crafting" aria-labelledby="crafting-title">
      <h2 id="crafting-title">Crafting</h2>
      <ul className="recipes">
        {RECIPE_IDS.map((id) => {
          const recipe = RECIPES[id];
          const name = ITEMS[recipe.output.item].name;
          const inputs = Object.entries(recipe.inputs).map(([item, need]) => {
            const have = inventory[item as ItemId] ?? 0;
            return { item: item as ItemId, have, need, missing: have < need };
          });
          const canCraft = job === null && hasItems(inventory, recipe.inputs);
          return (
            <li key={id} className="recipe">
              <h3>{name}</h3>
              <ul aria-label={`${name} needs`}>
                {inputs.map(({ item, have, need, missing }) => (
                  <li key={item} className={missing ? "missing" : undefined}>
                    <span>{ITEMS[item].name}</span>{" "}
                    <span className="count">
                      {have}/{need}
                      {missing && <span className="visually-hidden"> (not enough)</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                aria-label={`Craft ${name}`}
                disabled={!canCraft}
                onClick={() => onCraft(id)}
              >
                Craft
              </button>
            </li>
          );
        })}
      </ul>
      {job?.kind === "craft" && (
        <p className="working" role="status">
          Crafting {ITEMS[RECIPES[job.recipeId].output.item].name.toLowerCase()}…
        </p>
      )}
    </section>
  );
}
