export {
  BUILD_COSTS,
  BUILD_DURATION_MS,
  BUILDING_KINDS,
  BUILDING_LIMITS,
  BUILDING_SIZES,
  type Building,
  type BuildingKind,
  CARRY_LIMIT,
  covers,
  footprint,
  isBuildingKind,
  REMOVE_DURATION_MS,
  STARTING_BUILDINGS,
  STARTING_HOUSE,
  STARTING_STOREHOUSE,
  STOREHOUSE_LIMIT,
  startingBuildings,
} from "./data/buildings.ts";
export {
  FIELD_GROW_MS,
  FIELD_SEEDS,
  FIELD_WHEAT,
  HARVEST_DURATION_MS,
  SEED_EVERY,
  STARTING_FIELDS,
} from "./data/farming.ts";
export { ITEM_IDS, ITEMS, type ItemId, isItemId } from "./data/items.ts";
export { MOVE_SLACK_TILES, WALK_SPEED_TILES_PER_SECOND } from "./data/movement.ts";
export { isRecipeId, RECIPE_IDS, RECIPES, type Recipe, type RecipeId } from "./data/recipes.ts";
export {
  GATHER_DURATION_MS,
  GATHER_YIELD,
  isNodeId,
  NODE_IDS,
  type NodeId,
  nodeYielding,
  RESOURCE_NODES,
  type ResourceNode,
} from "./data/resources.ts";
export {
  VILLAGER_GATHER_MS,
  VILLAGER_JOBS,
  VILLAGER_LOAD,
  VILLAGER_NAMES,
  VILLAGER_WALK_TILES_PER_SECOND,
  VILLAGERS_PER_HOUSE,
  type VillagerJob,
  WANDER_RADIUS,
} from "./data/villagers.ts";
export {
  CONNECTIONS,
  inRect,
  isRegionId,
  isWater,
  openSections,
  REGION_IDS,
  REGIONS,
  type Rect,
  type RegionId,
  SECTION_SIZE,
  type Section,
  type Side,
  SPAWN_POINT,
  STARTING_REGION,
  TRAVEL_DURATION_MS,
  TRAVEL_ZONE_TILES,
  type TravelZone,
  travelZonesIn,
} from "./data/world.ts";
export {
  DEFAULT_FACING,
  DIRECTION_VECTORS,
  DIRECTIONS,
  type Direction,
  directionBetween,
  isDirection,
  tileInFront,
} from "./game/direction.ts";
export type {
  BuildJob,
  CharacterState,
  CraftJob,
  Field,
  GameState,
  GatherJob,
  HarvestJob,
  Inventory,
  Job,
  OtherBase,
  RemoveJob,
  TravelJob,
  Villager,
  VillagerTask,
  WorldOverview,
} from "./game/state.ts";
export { ActionRequest, type GameAction, type GameActionType } from "./protocol/actions.ts";
export { LoginRequest, SignUpRequest } from "./protocol/auth.ts";
export { LIMITS } from "./protocol/limits.ts";
export {
  BuildingBuild,
  BuildingRemove,
  ChatSend,
  CLIENT_MESSAGES,
  type ClientMessage,
  type ClientMessageType,
  CraftStart,
  FieldHarvest,
  FieldPlant,
  GatherStart,
  MoveTo,
  parseClientMessage,
  StorehouseTransfer,
  TravelStart,
  Turn,
  VillagerAssign,
} from "./protocol/messages.ts";
export { FAILURE_REASONS, type FailureReason, isFailureReason } from "./protocol/reasons.ts";
export { isCompatibleProtocol, PROTOCOL_VERSION } from "./protocol/version.ts";
export { fail, ok, type RuleResult } from "./result.ts";
export { type ActionFailure, applyAction, settleWorld } from "./rules/actions.ts";
export {
  type BuildFailure,
  completeBuild,
  type PlacementWorld,
  placementBlocked,
  type RemoveFailure,
  startBuild,
  startRemove,
} from "./rules/build.ts";
export {
  buildingAt,
  buildingById,
  buildingsOf,
  distanceToBuilding,
  houseDoor,
  isBlocked,
  storehouseInFront,
  storehousesByDistance,
} from "./rules/buildings.ts";
export { startCraft } from "./rules/craft.ts";
export {
  completeHarvest,
  fieldId,
  harvestOnce,
  newField,
  nextHarvestDropsSeed,
  plantingBlocked,
  plantSeed,
  startHarvest,
} from "./rules/farming.ts";
export { startGather } from "./rules/gather.ts";
export { addItems, hasItems, removeItems } from "./rules/inventory.ts";
export { resolveJob } from "./rules/jobs.ts";
export { maxWalkTiles, moveTo, tileDistance } from "./rules/move.ts";
export {
  atStorehouse,
  canCarry,
  type StorehouseFailure,
  storageOf,
  storeItems,
  takeItems,
} from "./rules/storehouse.ts";
export { arrivalTile, completeTravel, startTravel, travelZoneAt } from "./rules/travel.ts";
export {
  assignVillager,
  deliveriesBy,
  dropOffSpot,
  pickVillagerNames,
  type Route,
  returnRake,
  settleVillagers,
  taskTarget,
  taskTimeline,
  villagerActivity,
  villagerRoute,
  workSpot,
} from "./rules/villagers.ts";
