import { z } from "zod";
import { LIMITS } from "./limits.ts";

const coordinate = z.int().min(0).max(LIMITS.maxCoordinate);

/** Intent: walk to a tile. The room checks region bounds and movement speed. */
export const MoveTo = z.strictObject({ x: coordinate, y: coordinate });
export type MoveTo = z.infer<typeof MoveTo>;

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
