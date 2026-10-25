import { z } from "zod";
import { ITEM_IDS } from "../data/items.ts";
import { RECIPE_IDS } from "../data/recipes.ts";
import { NODE_IDS } from "../data/resources.ts";
import { DIRECTIONS } from "../game/direction.ts";
import { LIMITS } from "./limits.ts";

const coordinate = z.int().min(0).max(LIMITS.maxCoordinate);

/** Intent: walk to a tile. The room checks region bounds and movement speed. */
export const MoveTo = z.strictObject({ x: coordinate, y: coordinate });
export type MoveTo = z.infer<typeof MoveTo>;

/** Intent: move items between the character's hands and the storehouse in front of it. */
export const StorehouseTransfer = z.strictObject({
  item: z.enum(ITEM_IDS),
  quantity: z.int().min(1).max(100),
});
export type StorehouseTransfer = z.infer<typeof StorehouseTransfer>;

/** Intent: turn to face a direction without moving. */
export const Turn = z.strictObject({ facing: z.enum(DIRECTIONS) });
export type Turn = z.infer<typeof Turn>;

/** Intent: start gathering at a resource node next to the character. */
export const GatherStart = z.strictObject({ nodeId: z.enum(NODE_IDS) });
export type GatherStart = z.infer<typeof GatherStart>;

/** Intent: start harvesting a grown wheat field next to the character. */
export const FieldHarvest = z.strictObject({ fieldId: z.string().min(1).max(64) });
export type FieldHarvest = z.infer<typeof FieldHarvest>;

/** Intent: plant a wheat seed on the tile in front of the character. */
export const FieldPlant = z.strictObject({});
export type FieldPlant = z.infer<typeof FieldPlant>;

/** Intent: start crafting a recipe (anywhere). */
export const CraftStart = z.strictObject({ recipeId: z.enum(RECIPE_IDS) });
export type CraftStart = z.infer<typeof CraftStart>;

/** Intent: say something in the current region's chat. */
export const ChatSend = z.strictObject({
  text: z.string().trim().min(1).max(LIMITS.chatMaxLength),
});
export type ChatSend = z.infer<typeof ChatSend>;

/**
 * Every client → room message, by type. Rooms register a handler per key and
 * parse the payload with this schema before doing anything else (AGENTS.md rule 4).
 */
export const CLIENT_MESSAGES = {
  "move.to": MoveTo,
  "chat.send": ChatSend,
} as const;

export type ClientMessageType = keyof typeof CLIENT_MESSAGES;
export type ClientMessage<T extends ClientMessageType> = z.infer<(typeof CLIENT_MESSAGES)[T]>;

/** Parses an incoming payload for a message type; returns null when it's invalid. */
export function parseClientMessage<T extends ClientMessageType>(
  type: T,
  payload: unknown,
): ClientMessage<T> | null {
  const result = CLIENT_MESSAGES[type].safeParse(payload);
  return result.success ? (result.data as ClientMessage<T>) : null;
}
