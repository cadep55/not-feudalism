import { CARRY_LIMIT, type Inventory, ITEM_IDS, ITEMS, type Job, RESOURCE_NODES } from "@nf/shared";

type Props = {
  inventory: Inventory;
  job: Job | null;
};

/** What the character carries (out of the carry limit), plus what it's busy gathering or harvesting (crafting shows in the CraftingPanel). */
export function InventoryPanel({ inventory, job }: Props) {
  const held = ITEM_IDS.flatMap((id) => {
    const count = inventory[id] ?? 0;
    return count > 0 ? [{ id, name: ITEMS[id].name, count }] : [];
  });

  return (
    <section className="panel inventory" aria-labelledby="inventory-title">
      <h2 id="inventory-title">Inventory</h2>
      {held.length === 0 ? (
        <p className="empty">Empty — click a tree or rock to gather.</p>
      ) : (
        <ul>
          {held.map((item) => (
            <li key={item.id} className={item.count >= CARRY_LIMIT ? "full" : undefined}>
              <span>{item.name}</span>{" "}
              <span className="count">
                {item.count}/{CARRY_LIMIT}
              </span>
            </li>
          ))}
        </ul>
      )}
      {job?.kind === "gather" && (
        <p className="working" role="status">
          Gathering {ITEMS[RESOURCE_NODES[job.nodeId].yields].name.toLowerCase()}…
        </p>
      )}
      {job?.kind === "harvest" && (
        <p className="working" role="status">
          Harvesting wheat…
        </p>
      )}
    </section>
  );
}
