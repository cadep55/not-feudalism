export { ITEM_IDS, ITEMS, type ItemId, isItemId } from "./data/items.ts";
export { MOVE_SLACK_TILES, WALK_SPEED_TILES_PER_SECOND } from "./data/movement.ts";
export {
  GATHER_DURATION_MS,
  GATHER_YIELD,
  isNodeId,
  NODE_IDS,
  type NodeId,
  RESOURCE_NODES,
  type ResourceNode,
} from "./data/resources.ts";
export {
  isRegionId,
  REGIONS,
  type RegionId,
  SPAWN_POINT,
  STARTING_REGION,
} from "./data/world.ts";
export type { CharacterState, GameState, GatherJob, Inventory, Job } from "./game/state.ts";
export { ActionRequest, type GameAction, type GameActionType } from "./protocol/actions.ts";
export { LoginRequest, SignUpRequest } from "./protocol/auth.ts";
export { LIMITS } from "./protocol/limits.ts";
export {
  ChatSend,
  CLIENT_MESSAGES,
  type ClientMessage,
  type ClientMessageType,
  GatherStart,
  MoveTo,
  parseClientMessage,
} from "./protocol/messages.ts";
export { FAILURE_REASONS, type FailureReason, isFailureReason } from "./protocol/reasons.ts";
export { isCompatibleProtocol, PROTOCOL_VERSION } from "./protocol/version.ts";
export { fail, ok, type RuleResult } from "./result.ts";
export { type ActionFailure, applyAction } from "./rules/actions.ts";
export { addItems, resolveJob, startGather } from "./rules/gather.ts";
export { maxWalkTiles, moveTo, tileDistance } from "./rules/move.ts";
