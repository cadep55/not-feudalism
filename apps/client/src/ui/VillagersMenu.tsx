import type { Villager, VillagerJob } from "@nf/shared";
import { useState } from "react";
import { VillagersPanel } from "./VillagersPanel.tsx";

type Props = {
  villagers: Villager[];
  onAssign: (villagerId: string, job: VillagerJob) => void;
};

/** A dropdown in the map's top-left corner holding the villagers and their job selectors. */
export function VillagersMenu({ villagers, onAssign }: Props) {
  const [open, setOpen] = useState(false);
  const working = villagers.filter((v) => v.task).length;
  return (
    <div className="villagers-menu">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="villagers-dropdown"
        onClick={() => setOpen((o) => !o)}
      >
        Villagers ({working}/{villagers.length} working) {open ? "▴" : "▾"}
      </button>
      {open && (
        <div id="villagers-dropdown" className="villagers-dropdown">
          <VillagersPanel villagers={villagers} onAssign={onAssign} />
        </div>
      )}
    </div>
  );
}
