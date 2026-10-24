// Movement balance. The client walks at this speed and the server refuses moves faster than it.

// TODO(design): how fast characters walk.
export const WALK_SPEED_TILES_PER_SECOND = 4;

/** Extra tiles the server tolerates per move, so network delay never rejects honest walking. */
export const MOVE_SLACK_TILES = 1;
