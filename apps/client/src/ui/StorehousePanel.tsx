import {
  CARRY_LIMIT,
  type GameState,
  ITEM_IDS,
  ITEMS,
  type ItemId,
  STOREHOUSE_LIMIT,
  storageOf,
  storehouseInFront,
} from "@nf/shared";

type Props = {
  state: GameState;
  /** Set briefly after walking up to the storehouse, to draw the eye to this panel. */
  highlighted?: boolean;
  onStore: (item: ItemId, quantity: number) => void;
  onTake: (item: ItemId, quantity: number) => void;
};

/**
 * What the storehouse the character faces holds (each storehouse keeps its own
 * stock), with buttons to move items between it and the character's hands.
 * Store puts away everything carried of an item (as much as fits); Take picks
 * up as many as the character can carry. Both only work while standing beside
 * a storehouse and facing it.
 */
export function StorehousePanel({ state, highlighted = false, onStore, onTake }: Props) {
  const storehouse = storehouseInFront(state);
  const usable = storehouse !== null;
  const storage = storehouse ? storageOf(state, storehouse.id) : {};
  const stored = ITEM_IDS.flatMap((id) => {
    const count = storage[id] ?? 0;
    const room = CARRY_LIMIT - (state.inventory[id] ?? 0);
    return count > 0 ? [{ id, name: ITEMS[id].name, count, take: Math.min(count, room) }] : [];
  });
  const carried = ITEM_IDS.flatMap((id) => {
    const count = state.inventory[id] ?? 0;
    const room = STOREHOUSE_LIMIT - (storage[id] ?? 0);
    return count > 0 ? [{ id, name: ITEMS[id].name, count, store: Math.min(count, room) }] : [];
  });

  return (
    <section
      className={highlighted ? "panel storehouse highlighted" : "panel storehouse"}
      aria-labelledby="storehouse-title"
    >
      <h2 id="storehouse-title">Storehouse</h2>
      {stored.length === 0 ? (
        <p className="empty">Nothing stored yet.</p>
      ) : (
        <ul aria-label="In the storehouse">
          {stored.map((item) => (
            <li key={item.id}>
              <span>
                <span>{item.name}</span>{" "}
                <span className="count">
                  {item.count}/{STOREHOUSE_LIMIT}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Take ${item.name}`}
                disabled={!usable || item.take <= 0}
                onClick={() => onTake(item.id, item.take)}
              >
                Take
              </button>
            </li>
          ))}
        </ul>
      )}
      {carried.length > 0 && (
        <>
          <h3>Carrying</h3>
          <ul aria-label="Carrying">
            {carried.map((item) => (
              <li key={item.id}>
                <span>
                  <span>{item.name}</span> <span className="count">{item.count}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Store ${item.name}`}
                  disabled={!usable || item.store <= 0}
                  onClick={() => onStore(item.id, item.store)}
                >
                  Store
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!usable && <p className="empty away">Walk to the storehouse and face it to use it.</p>}
    </section>
  );
}
