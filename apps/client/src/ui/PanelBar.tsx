import type { ReactNode } from "react";
import { PANEL_IDS, PANEL_LABELS, type PanelId } from "./panels.ts";

type Props = {
  open: readonly PanelId[];
  onToggle: (id: PanelId) => void;
  panels: Record<PanelId, ReactNode>;
  /** More buttons after the panel tabs (e.g. the World view). */
  extra?: ReactNode;
};

/**
 * The bar across the bottom of the screen: a tab per panel to open or close it,
 * and the open panels side by side, sharing the width evenly.
 */
export function PanelBar({ open, onToggle, panels, extra }: Props) {
  return (
    <div className="panel-bar">
      <div className="panel-tabs" role="toolbar" aria-label="Panels">
        {PANEL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={open.includes(id)}
            onClick={() => onToggle(id)}
          >
            {PANEL_LABELS[id]}
          </button>
        ))}
        {extra}
      </div>
      {open.length === 0 ? (
        <p className="panel-bar-empty">All panels are closed. Open one with the tabs above.</p>
      ) : (
        <div className="panel-row" data-open={open.length}>
          {open.map((id) => (
            <div key={id} className="panel-slot">
              {panels[id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
