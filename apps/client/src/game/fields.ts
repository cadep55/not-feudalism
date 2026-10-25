import type { Field } from "@nf/shared";
import type { Tile } from "./movement.ts";

/** The wheat fields drawn on a region's map. */
export function fieldsIn(fields: readonly Field[], region: string): Field[] {
  return fields.filter((f) => f.region === region);
}

/** The field on a clicked tile, or null when there is none. */
export function fieldAt(fields: readonly Field[], tile: Tile, region: string): Field | null {
  return fields.find((f) => f.region === region && f.x === tile.x && f.y === tile.y) ?? null;
}

/** A planted field grows until `readyAt`; it can't be harvested before then. */
export function isGrowing(field: Field, now: number): boolean {
  return now < field.readyAt;
}

/** Milliseconds until a growing field is ready; 0 once grown. */
export function growTimeLeft(field: Field, now: number): number {
  return Math.max(field.readyAt - now, 0);
}

/** A remaining time as minutes and seconds, rounded up so "0:00" only shows when done: "4:05". */
export function formatGrowTime(ms: number): string {
  const seconds = Math.ceil(Math.max(ms, 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The small label on a field: time left while growing, wheat left once grown. */
export function fieldLabel(field: Field, now: number): string {
  return isGrowing(field, now) ? formatGrowTime(growTimeLeft(field, now)) : String(field.wheat);
}
