/**
 * Everything the client needs to draw a character's game. The server is the
 * source of truth; the client only ever receives this, never sends it.
 * Inventory and timed jobs join this in issue #19.
 */
export type CharacterState = {
  id: string;
  name: string;
  rank: string;
  /** Smallest coin unit; always an integer. */
  gold: number;
  region: string;
  x: number;
  y: number;
  /** When the character last moved, in milliseconds since the epoch. Used for speed checks. */
  movedAt: number;
};

export type GameState = {
  character: CharacterState;
};
