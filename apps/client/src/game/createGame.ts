import {
  BUILDING_SIZES,
  type Building,
  type BuildingKind,
  type CharacterState,
  type Direction,
  type Field,
  houseDoor,
  isRegionId,
  isWater,
  type Job,
  type NodeId,
  type OtherBase,
  placementBlocked,
  REGIONS,
  RESOURCE_NODES,
  type ResourceNode,
  travelZoneAt,
  type Villager,
  type VillagerTask,
  villagerActivity,
  villagerRoute,
} from "@nf/shared";
import Phaser from "phaser";
import {
  approachTile,
  buildingAt,
  buildingsIn,
  drawnBuildingsKey,
  readyAtBuilding,
  turnTowardBuilding,
} from "./buildings.ts";
import { arrowPlacement, facingAfterStep, turnBeforeGather } from "./facing.ts";
import { fieldAt, fieldLabel, fieldsIn, isGrowing } from "./fields.ts";
import {
  jobProgress,
  nearestAdjacentTile,
  nodeAt,
  nodesIn,
  readyToGather,
  walkingCancels,
} from "./gathering.ts";
import {
  clampToRegion,
  keyDirection,
  type RegionSize,
  STEP_MS,
  samePlace,
  shouldSend,
  stepToward,
  type Tile,
  tileAt,
} from "./movement.ts";
import {
  type Home,
  type Point,
  pickWanderTile,
  planStroll,
  type Stroll,
  strollPosition,
} from "./villagers.ts";

const TILE = 32;
/** How far a gathering villager bobs, in pixels, and how fast (ms per bob): a subtle "working" cue. */
const VILLAGER_BOB_PX = 3;
const VILLAGER_BOB_MS = 400;
/** The facing arrow is a hint, not a feature: keep it faint. */
const ARROW_ALPHA = 0.45;
/** The placement preview: green where a building fits, red where it doesn't. */
const GHOST_OK = 0x7cc04a;
const GHOST_BLOCKED = 0xc0392b;
const GHOST_ALPHA = 0.45;
/** A building going up or coming down is drawn see-through. */
const WORKING_ALPHA = 0.45;
/** The faint rectangle over a travel zone while the character stands on it. */
const ZONE_COLOR = 0xf5e9c8;
const ZONE_FILL_ALPHA = 0.18;
const ZONE_LINE_ALPHA = 0.6;

/**
 * What the server said about a position update: the facing it recorded (null
 * when unknown, e.g. a network blip), and on refusal where the character really is.
 */
export type MoveOutcome =
  | { ok: true; facing: Direction | null }
  | { ok: false; position: Tile; facing: Direction | null; message: string };

export type WorldOptions = {
  character: CharacterState;
  /** The job in progress when the game starts; later changes arrive through World.setJob. */
  job: Job | null;
  /** The wheat fields when the game starts; later changes arrive through World.setFields. */
  fields: Field[];
  /** The villagers when the game starts; later changes arrive through World.setVillagers. */
  villagers: Villager[];
  /** The buildings when the game starts; later changes arrive through World.setBuildings. */
  buildings: Building[];
  /** Other players' bases in this section; later changes arrive through World.setOthers. */
  others: OtherBase[];
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  /** Asks the server to start gathering; the result comes back as a setJob call. */
  startGather: (nodeId: NodeId) => void;
  /** Asks the server to start harvesting a field; the result comes back as setJob/setFields calls. */
  startHarvest: (fieldId: string) => void;
  /** Asks the server to turn the character in place; resolves true once it accepts. */
  turn: (facing: Direction) => Promise<boolean>;
  /** The character stands beside the storehouse facing it: show the storehouse panel. */
  openStorehouse: () => void;
  /** The player placed a building (top-left tile) while in placement mode. */
  build: (kind: BuildingKind, x: number, y: number) => void;
  /** The character stands still on a travel zone: ask the server to travel. */
  startTravel: () => void;
};

/** What the React side holds on to: tell the world about job and field changes, tear it down. */
export type World = {
  setJob: (job: Job | null) => void;
  setFields: (fields: Field[]) => void;
  setVillagers: (villagers: Villager[]) => void;
  setBuildings: (buildings: Building[]) => void;
  setOthers: (others: OtherBase[]) => void;
  /** Enters placement mode for a kind of building, or leaves it (null). */
  setPlacing: (kind: BuildingKind | null) => void;
  destroy: () => void;
};

/** Something the character walks up to and then uses: a resource node, a wheat field or a building. */
type Target =
  | { kind: "node"; id: NodeId }
  | { kind: "field"; id: string }
  | { kind: "building"; id: string };

/** A villager drawn on the map, and (while idle) the stroll it's on. Idle wandering is client-only. */
type VillagerSprite = { figure: Phaser.GameObjects.Container; at: Point; stroll: Stroll | null };

type MovementKeys = Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key[]>;

/**
 * The player's character on the region map. Walks one tile per step at the
 * server's speed (click a tile, or hold arrows/WASD) and reports positions to
 * the server, snapping back if it refuses. The character faces the way it last
 * stepped, shown by a faint arrow. Clicking a resource node walks next to it,
 * turns toward it if needed, then asks the server to start gathering; a wheat
 * field works the same way with harvesting. Clicking the storehouse does the
 * same, then opens the storehouse panel.
 */
class WorldScene extends Phaser.Scene {
  private readonly options: WorldOptions;
  private readonly region: RegionSize;
  private position: Tile;
  /** Which way the character faces on screen: the way it last stepped. */
  private facing: Direction;
  /** The facing the server last confirmed; null when unknown. Decides whether to turn before gathering. */
  private serverFacing: Direction | null;
  private destination: Tile | null = null;
  private stepping = false;
  private lastSent: Tile;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private inFlight = false;
  /** What to gather at or use once the character stands next to it. */
  private target: Target | null = null;
  /** The target waiting on a turn before use; cleared if the player does anything else. */
  private turningToward: Target | null = null;
  private job: Job | null;
  private fields: Field[];
  /** What the field layer last drew (ids and labels); redrawn when this changes. */
  private drawnFields: string | null = null;
  private fieldLayer: Phaser.GameObjects.Container | null = null;
  private villagers: Villager[];
  private buildings: Building[];
  private others: OtherBase[];
  /** The travel zone tile a trip was last asked for, so it's asked once per visit. */
  private travelAskedAt: string | null = null;
  private zoneMarker!: Phaser.GameObjects.Graphics;
  /** What the building layer last drew; redrawn when this changes. */
  private drawnBuildings: string | null = null;
  private buildingLayer: Phaser.GameObjects.Container | null = null;
  /** The kind of building being placed, if any, and the tile under the pointer. */
  private placing: BuildingKind | null = null;
  private hovered: Tile | null = null;
  private ghost!: Phaser.GameObjects.Graphics;
  private villagerLayer: Phaser.GameObjects.Container | null = null;
  private readonly villagerSprites = new Map<string, VillagerSprite>();
  private avatar!: Phaser.GameObjects.Container;
  private arrow!: Phaser.GameObjects.Graphics;
  private progressBar!: Phaser.GameObjects.Graphics;
  private toast!: Phaser.GameObjects.Text;
  private keys!: MovementKeys;

  constructor(options: WorldOptions) {
    super("world");
    this.options = options;
    const { region } = options.character;
    if (!isRegionId(region)) throw new Error(`Unknown region "${region}"`);
    this.region = REGIONS[region];
    this.position = { x: options.character.x, y: options.character.y };
    this.facing = options.character.facing;
    this.serverFacing = options.character.facing;
    this.lastSent = this.position;
    this.job = options.job;
    this.fields = options.fields;
    this.villagers = options.villagers;
    this.buildings = options.buildings;
    this.others = options.others;
  }

  /** The server's latest word on other players' bases here. Safe to call before the scene starts. */
  setOthers(others: OtherBase[]) {
    this.others = others;
  }

  /** The server's latest word on the buildings. Safe to call before the scene starts. */
  setBuildings(buildings: Building[]) {
    this.buildings = buildings;
  }

  /** Enters or leaves placement mode. Safe to call before the scene starts. */
  setPlacing(kind: BuildingKind | null) {
    this.placing = kind;
  }

  /** The server's latest word on the character's job. Safe to call before the scene starts. */
  setJob(job: Job | null) {
    this.job = job;
  }

  /** The server's latest word on the wheat fields. Safe to call before the scene starts. */
  setFields(fields: Field[]) {
    this.fields = fields;
  }

  /** The server's latest word on the villagers. Safe to call before the scene starts. */
  setVillagers(villagers: Villager[]) {
    this.villagers = villagers;
    const ids = new Set(villagers.map((v) => v.id));
    for (const [id, sprite] of this.villagerSprites) {
      if (ids.has(id)) continue;
      sprite.figure.destroy();
      this.villagerSprites.delete(id);
    }
  }

  create() {
    const grid = this.add.graphics();
    const { region } = this.options.character;
    for (let y = 0; y < this.region.height; y++) {
      for (let x = 0; x < this.region.width; x++) {
        const checker = (x + y) % 2 === 0;
        const water = isWater(region, { x, y });
        grid.fillStyle(water ? (checker ? 0x2f6a9e : 0x3474a8) : checker ? 0x4a7a3a : 0x52863f, 1);
        grid.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Fields, nodes and buildings sit above the grass and below the character (drawing order sets depth).
    this.fieldLayer = this.add.container(0, 0);
    this.drawFields();
    const nodes = this.add.graphics();
    for (const id of nodesIn(this.options.character.region)) {
      drawNode(nodes, RESOURCE_NODES[id]);
    }
    this.buildingLayer = this.add.container(0, 0);
    this.drawBuildings();

    // Villagers walk over fields and buildings but below the player's character.
    this.villagerLayer = this.add.container(0, 0);
    this.drawVillagers();

    // The faint rectangle over the travel zone the character stands on, under the character.
    this.zoneMarker = this.add.graphics();

    // A faint chevron at the tile's edge marks the character's front.
    this.arrow = this.add.graphics();
    this.arrow.fillStyle(0xf5e9c8, ARROW_ALPHA);
    this.arrow.fillTriangle(3, 0, -3, -4, -3, 4);
    this.drawFacing();

    const body = this.add.circle(0, 0, TILE * 0.38, 0xc9a227).setStrokeStyle(3, 0x4a2e16);
    const label = this.add
      .text(0, -TILE * 0.75, this.options.character.name, {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#f5e9c8",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5);
    this.progressBar = this.add.graphics().setVisible(false);
    this.avatar = this.add.container(...this.pixelsOf(this.position), [
      this.arrow,
      body,
      label,
      this.progressBar,
    ]);

    this.toast = this.add
      .text(this.scale.width / 2, 16, "", {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: "#f5e9c8",
        backgroundColor: "#a4161acc",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    // The placement preview sits above the buildings and characters.
    this.ghost = this.add.graphics();
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.hovered = tileAt(pointer.worldX, pointer.worldY, TILE, this.region);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const tile = tileAt(pointer.worldX, pointer.worldY, TILE, this.region);
      if (!tile) return;
      if (this.placing) {
        this.place(this.placing, tile);
        return;
      }
      const { region } = this.options.character;
      const nodeId = nodeAt(tile, region);
      const field = fieldAt(this.fields, tile, region);
      const building = buildingAt(this.buildings, tile, region);
      this.turningToward = null;
      if (nodeId) {
        const approach = nearestAdjacentTile(this.position, RESOURCE_NODES[nodeId], this.region);
        this.target = approach ? { kind: "node", id: nodeId } : null;
        this.destination = approach;
      } else if (field) {
        // A growing field is still a target: the server's refusal says it's not ready yet.
        const approach = nearestAdjacentTile(this.position, field, this.region);
        this.target = approach ? { kind: "field", id: field.id } : null;
        this.destination = approach;
      } else if (building?.kind === "storehouse") {
        const approach = approachTile(this.position, building, this.region, this.buildings);
        this.target = approach ? { kind: "building", id: building.id } : null;
        this.destination = approach;
      } else {
        // Open ground, or a building with nothing to do yet (buildings don't block walking).
        this.target = null;
        this.destination = tile;
      }
    });

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input is unavailable");
    const key = (code: number) => keyboard.addKey(code);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [key(K.UP), key(K.W)],
      down: [key(K.DOWN), key(K.S)],
      left: [key(K.LEFT), key(K.A)],
      right: [key(K.RIGHT), key(K.D)],
    };
  }

  override update(time: number) {
    const held = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);
    const direction = keyDirection({
      up: held(this.keys.up),
      down: held(this.keys.down),
      left: held(this.keys.left),
      right: held(this.keys.right),
    });
    const usingKeys = direction.x !== 0 || direction.y !== 0;
    if (usingKeys) {
      this.destination = null;
      this.target = null;
      this.turningToward = null;
    }

    if (!this.stepping) {
      const next = usingKeys
        ? clampToRegion(
            { x: this.position.x + direction.x, y: this.position.y + direction.y },
            this.region,
          )
        : this.destination && stepToward(this.position, this.destination);
      if (next && isWater(this.options.character.region, next)) {
        // The shore: stop here rather than walk into the water (the server would refuse it).
        this.destination = null;
        this.target = null;
      } else if (next && !samePlace(next, this.position)) this.stepTo(next);
      else if (this.destination && samePlace(this.destination, this.position))
        this.destination = null;
    }

    const walking = this.stepping || usingKeys || this.destination !== null;
    if (
      shouldSend({
        position: this.position,
        lastSent: this.lastSent,
        lastSentAt: this.lastSentAt,
        now: time,
        inFlight: this.inFlight,
        walking,
      })
    ) {
      this.send(time);
    }

    const target = this.target;
    if (target && this.destination === null && this.readyFor(target)) {
      this.target = null;
      this.use(target);
    }

    this.maybeTravel();
    this.drawProgress();
    this.drawGhost();
    this.drawBuildings();
    this.drawFields();
    this.drawVillagers();
  }

  private fieldById(id: string): Field | null {
    return this.fields.find((f) => f.id === id) ?? null;
  }

  private buildingById(id: string): Building | null {
    return this.buildings.find((b) => b.id === id) ?? null;
  }

  /** Standing still next to the target, with the server agreeing where we stand. */
  private readyFor(target: Target): boolean {
    const settled = {
      position: this.position,
      lastSent: this.lastSent,
      inFlight: this.inFlight,
      stepping: this.stepping,
    };
    switch (target.kind) {
      case "node":
        return readyToGather({ ...settled, node: RESOURCE_NODES[target.id] });
      case "field": {
        const field = this.fieldById(target.id);
        // Gone while we walked: ask anyway once settled, and the server says it's gone.
        if (!field) return !settled.inFlight && !settled.stepping;
        return readyToGather({ ...settled, node: field });
      }
      case "building": {
        const building = this.buildingById(target.id);
        // Removed while we walked: drop it once settled.
        if (!building) return !settled.inFlight && !settled.stepping;
        return readyAtBuilding({ ...settled, building });
      }
    }
  }

  /** What to do once facing the target, and which way to turn first (null: no turn needed). */
  private plan(target: Target): { act: () => void; toward: Direction | null } {
    switch (target.kind) {
      case "node":
        return {
          act: () => this.options.startGather(target.id),
          toward: turnBeforeGather(this.position, RESOURCE_NODES[target.id], this.serverFacing),
        };
      case "field": {
        const field = this.fieldById(target.id);
        return {
          act: () => this.options.startHarvest(target.id),
          toward: field ? turnBeforeGather(this.position, field, this.serverFacing) : null,
        };
      }
      case "building": {
        const building = this.buildingById(target.id);
        if (!building) return { act: () => {}, toward: null };
        return {
          act: () => this.options.openStorehouse(),
          toward: turnTowardBuilding(this.position, building, this.serverFacing),
        };
      }
    }
  }

  /**
   * Turn toward the target first when the server doesn't have us facing it,
   * then gather at the node, harvest the field or open the storehouse.
   */
  private use(target: Target) {
    const { act, toward } = this.plan(target);
    if (toward === null) {
      act();
      return;
    }
    const before = this.facing;
    const at = this.position;
    this.turningToward = target;
    this.setFacing(toward);
    this.options.turn(toward).then((accepted) => {
      // The player clicked elsewhere, walked off or got snapped back meanwhile.
      const stillWaiting = this.turningToward === target && samePlace(this.position, at);
      if (this.turningToward === target) this.turningToward = null;
      if (!accepted) {
        if (stillWaiting) this.setFacing(before);
        return;
      }
      if (!stillWaiting) return;
      this.serverFacing = toward;
      act();
    });
  }

  /**
   * Draws the region's wheat fields, each with a small label: time left while
   * growing, wheat left once grown. Cheap to call every frame: it only redraws
   * when a field or a label changed.
   */
  private drawFields() {
    const layer = this.fieldLayer;
    if (!layer) return;
    const now = Date.now();
    const all = [...this.fields, ...this.others.flatMap((o) => o.fields)];
    const shown = fieldsIn(all, this.options.character.region).map((field) => ({
      field,
      growing: isGrowing(field, now),
      label: fieldLabel(field, now),
    }));
    const key = shown.map((s) => `${s.field.id}=${s.growing ? "g" : ""}${s.label}`).join("|");
    if (key === this.drawnFields) return;
    this.drawnFields = key;

    layer.removeAll(true);
    const g = this.add.graphics();
    layer.add(g);
    for (const { field, growing, label } of shown) {
      drawField(g, field, growing);
      const text = this.add
        .text((field.x + 1) * TILE - 1, (field.y + 1) * TILE - 1, label, {
          fontFamily: "Georgia, serif",
          fontSize: "9px",
          color: growing ? "#c8f0b0" : "#f5e9c8",
          backgroundColor: "#00000088",
          padding: { x: 2, y: 0 },
        })
        .setOrigin(1, 1)
        .setAlpha(0.85);
      layer.add(text);
    }
  }

  /** Where a task works, from the latest fields; null once its field is gone. */
  private taskTarget(task: VillagerTask): Tile | null {
    if (task.kind === "gather") return RESOURCE_NODES[task.nodeId];
    return this.fieldById(task.fieldId);
  }

  /**
   * Standing still on a travel zone (with the server agreeing where we stand)
   * starts the trip, once per visit to the tile. Shows the zone's faint
   * rectangle while on it.
   */
  private maybeTravel() {
    const zone = travelZoneAt(this.options.character.region, this.position);
    this.zoneMarker.clear();
    if (!zone) {
      this.travelAskedAt = null;
      return;
    }
    const { tiles } = zone;
    this.zoneMarker.fillStyle(ZONE_COLOR, ZONE_FILL_ALPHA);
    this.zoneMarker.fillRect(
      tiles.x * TILE,
      tiles.y * TILE,
      tiles.width * TILE,
      tiles.height * TILE,
    );
    this.zoneMarker.lineStyle(2, ZONE_COLOR, ZONE_LINE_ALPHA);
    this.zoneMarker.strokeRect(
      tiles.x * TILE,
      tiles.y * TILE,
      tiles.width * TILE,
      tiles.height * TILE,
    );
    const here = `${this.position.x},${this.position.y}`;
    const settled =
      !this.stepping && !this.inFlight && samePlace(this.position, this.lastSent) && !this.job;
    if (!settled || this.travelAskedAt === here) return;
    this.travelAskedAt = here;
    this.options.startTravel();
  }

  /** Why a building can't go here, or null when it can (the same check the server makes). */
  private blockedAt(kind: BuildingKind, tile: Tile) {
    const world = {
      character: { region: this.options.character.region, ...this.position },
      buildings: this.buildings,
      fields: this.fields,
    };
    return placementBlocked(world, kind, tile.x, tile.y);
  }

  /** Places the building with its top-left on the tile if it fits, or says why not. */
  private place(kind: BuildingKind, tile: Tile) {
    if (this.blockedAt(kind, tile)) {
      this.showToast("You can't build there: it needs open grass with a clear tile on every side.");
      return;
    }
    this.options.build(kind, tile.x, tile.y);
  }

  /** The footprint under the pointer while placing: green where it fits, red where it doesn't. */
  private drawGhost() {
    const g = this.ghost;
    g.clear();
    if (!this.placing || !this.hovered) return;
    const { width, height } = BUILDING_SIZES[this.placing];
    const color = this.blockedAt(this.placing, this.hovered) ? GHOST_BLOCKED : GHOST_OK;
    g.fillStyle(color, GHOST_ALPHA);
    g.fillRect(this.hovered.x * TILE, this.hovered.y * TILE, width * TILE, height * TILE);
    g.lineStyle(2, color, 1);
    g.strokeRect(this.hovered.x * TILE, this.hovered.y * TILE, width * TILE, height * TILE);
  }

  /**
   * Draws the buildings: a labelled square each until we have pixel art, plus
   * a see-through one going up or coming down. Cheap to call every frame: it
   * only redraws when the buildings or the job changed.
   */
  private drawBuildings() {
    const layer = this.buildingLayer;
    if (!layer) return;
    const { region } = this.options.character;
    const shown = buildingsIn(this.buildings, region);
    const working = this.job?.kind === "build" || this.job?.kind === "remove" ? this.job : null;
    const site = working?.building.region === region ? working.building : null;
    const theirs = this.others.flatMap((o) =>
      buildingsIn(o.buildings, region).map((b) => ({ ...b, id: `${o.characterName}:${b.id}` })),
    );
    const key = `${drawnBuildingsKey(shown, site)}|${drawnBuildingsKey(theirs, null)}`;
    if (key === this.drawnBuildings) return;
    this.drawnBuildings = key;
    layer.removeAll(true);
    const g = this.add.graphics();
    layer.add(g);
    for (const building of shown) layer.add(this.drawBuilding(g, building));
    for (const other of this.others) {
      for (const building of buildingsIn(other.buildings, region)) {
        layer.add(this.drawBuilding(g, building, `${other.characterName}'s`));
      }
    }
    if (site) {
      const faded = this.add.graphics().setAlpha(WORKING_ALPHA);
      layer.add(faded);
      layer.add(this.drawBuilding(faded, site).setAlpha(WORKING_ALPHA));
    }
  }

  /** Where a villager's house is, for idle wandering; null when its house is gone or elsewhere. */
  private homeOf(villager: Villager): Home | null {
    const house = this.buildingById(villager.houseId);
    if (!house || house.region !== this.options.character.region) return null;
    return { door: houseDoor(house), region: house.region, buildings: this.buildings };
  }

  /**
   * Places every villager: working ones follow the shared timeline (the same
   * one the server settles by), bobbing while they gather; idle ones stroll to
   * random spots near their house and pause. Only drawn in their house's region.
   */
  private drawVillagers() {
    const layer = this.villagerLayer;
    if (!layer) return;
    const now = Date.now();
    for (const villager of this.villagers) {
      const home = this.homeOf(villager);
      if (!home) {
        this.villagerSprites.get(villager.id)?.figure.setVisible(false);
        continue;
      }
      const sprite = this.villagerSprite(villager, layer, home, now);
      sprite.figure.setVisible(true);
      const target = villager.task && this.taskTarget(villager.task);
      const route = villagerRoute(this.buildings, villager);
      let bob = 0;
      if (villager.task && target && route) {
        const doing = villagerActivity(villager.task, target, route, now);
        sprite.at = { x: doing.x, y: doing.y };
        sprite.stroll = null;
        if (doing.activity === "gathering") {
          bob = -VILLAGER_BOB_PX * Math.abs(Math.sin((now / VILLAGER_BOB_MS) * Math.PI));
        }
      } else {
        // Idle (or its field just ran out and the server will say so): wander from where it stands.
        if (!sprite.stroll || now >= sprite.stroll.nextAt) {
          sprite.stroll = planStroll(sprite.at, now, Math.random, this.region, home);
        }
        sprite.at = strollPosition(sprite.stroll, now);
      }
      sprite.figure.setPosition(sprite.at.x * TILE + TILE / 2, sprite.at.y * TILE + TILE / 2 + bob);
    }
  }

  /** The villager's figure, made on first sight: a small green-tunic figure with its name. */
  private villagerSprite(
    villager: Villager,
    layer: Phaser.GameObjects.Container,
    home: Home,
    now: number,
  ): VillagerSprite {
    const existing = this.villagerSprites.get(villager.id);
    if (existing) return existing;
    const body = this.add.circle(0, 0, TILE * 0.24, 0x5b7f3a).setStrokeStyle(2, 0x3b2a14);
    const head = this.add.circle(0, -TILE * 0.2, TILE * 0.11, 0xe0b98a).setStrokeStyle(1, 0x3b2a14);
    const label = this.add
      .text(0, -TILE * 0.52, villager.name, {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color: "#f5e9c8",
        backgroundColor: "#00000077",
        padding: { x: 3, y: 0 },
      })
      .setOrigin(0.5)
      .setAlpha(0.9);
    const figure = this.add.container(0, 0, [body, head, label]);
    layer.add(figure);
    // Start somewhere near the house, resting for a moment before the first stroll.
    const at = pickWanderTile(Math.random, this.region, home);
    const rest = Math.random() * 3_000;
    const stroll: Stroll = { from: at, to: at, departAt: now, arriveAt: now, nextAt: now + rest };
    const sprite = { figure, at, stroll };
    this.villagerSprites.set(villager.id, sprite);
    return sprite;
  }

  /**
   * A labelled square over the footprint until we have pixel art. Another
   * player's building is labelled with its owner. Returns the label.
   */
  private drawBuilding(g: Phaser.GameObjects.Graphics, building: Building, owner?: string) {
    const style = BUILDING_STYLES[building.kind];
    const left = building.x * TILE;
    const top = building.y * TILE;
    const width = building.width * TILE;
    const height = building.height * TILE;
    g.fillStyle(style.fill, 1);
    g.fillRect(left + 2, top + 2, width - 4, height - 4);
    g.lineStyle(3, style.outline, 1);
    g.strokeRect(left + 2, top + 2, width - 4, height - 4);
    return this.add
      .text(left + width / 2, top + height / 2, owner ? `${owner}\n${style.label}` : style.label, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#f5e9c8",
      })
      .setOrigin(0.5);
  }

  private setFacing(facing: Direction) {
    this.facing = facing;
    this.drawFacing();
  }

  private drawFacing() {
    const { x, y, angle } = arrowPlacement(this.facing, TILE / 2);
    this.arrow.setPosition(x, y).setRotation(angle);
  }

  /** A bar over the character's head while a job runs, computed from its timestamps. */
  private drawProgress() {
    const bar = this.progressBar;
    if (!this.job) {
      bar.setVisible(false);
      return;
    }
    const width = TILE;
    const height = 6;
    const top = -TILE * 1.3;
    bar.clear().setVisible(true);
    bar.fillStyle(0x2b1d0e, 0.85);
    bar.fillRect(-width / 2 - 1, top - 1, width + 2, height + 2);
    bar.fillStyle(0xc9a227, 1);
    bar.fillRect(-width / 2, top, width * jobProgress(this.job, Date.now()), height);
  }

  private stepTo(next: Tile) {
    this.stepping = true;
    // Walking away cancels a gather or harvest on the server; hide the bar now rather than on its reply.
    // A craft keeps going, so its bar keeps filling.
    if (this.job && walkingCancels(this.job)) this.job = null;
    this.setFacing(facingAfterStep(this.position, next, this.facing));
    const [x, y] = this.pixelsOf(next);
    this.tweens.add({
      targets: this.avatar,
      x,
      y,
      duration: STEP_MS,
      onComplete: () => {
        this.position = next;
        this.stepping = false;
      },
    });
  }

  private send(time: number) {
    const sent = this.position;
    this.inFlight = true;
    this.lastSent = sent;
    this.lastSentAt = time;
    this.options.sendPosition(sent).then((outcome) => {
      this.inFlight = false;
      this.serverFacing = outcome.facing;
      if (!outcome.ok) this.snapTo(outcome.position, outcome.facing, outcome.message);
    });
  }

  /** The server refused a move: put the character back where the server says it is. */
  private snapTo(tile: Tile, facing: Direction | null, message: string) {
    this.tweens.killTweensOf(this.avatar);
    this.stepping = false;
    this.destination = null;
    this.target = null;
    this.turningToward = null;
    if (facing) this.setFacing(facing);
    this.position = tile;
    this.lastSent = tile;
    this.avatar.setPosition(...this.pixelsOf(tile));
    this.showToast(message);
  }

  private showToast(message: string) {
    this.toast.setText(message).setVisible(true);
    this.time.delayedCall(2500, () => this.toast.setVisible(false));
  }

  private pixelsOf(tile: Tile): [number, number] {
    return [tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2];
  }
}

/** Plain coloured squares per kind until we have pixel art. */
const BUILDING_STYLES: Record<Building["kind"], { fill: number; outline: number; label: string }> =
  {
    storehouse: { fill: 0x7a4f2a, outline: 0x3d2510, label: "Storehouse" },
    house: { fill: 0x7b4fa0, outline: 0x3f2356, label: "House" },
  };

/** Simple shapes per kind until we have pixel art. */
function drawNode(g: Phaser.GameObjects.Graphics, node: ResourceNode) {
  const left = node.x * TILE;
  const top = node.y * TILE;
  const cx = left + TILE / 2;
  const cy = top + TILE / 2;
  switch (node.kind) {
    case "tree":
      g.fillStyle(0x5a3a1a, 1);
      g.fillRect(cx - 3, cy + 2, 6, TILE / 2 - 4);
      g.fillStyle(0x1f4d1a, 1);
      g.fillCircle(cx, cy - 2, TILE * 0.38);
      g.lineStyle(2, 0x14330f, 1);
      g.strokeCircle(cx, cy - 2, TILE * 0.38);
      break;
    case "rock":
      g.fillStyle(0x7d7d7d, 1);
      g.fillEllipse(cx, cy + 2, TILE * 0.8, TILE * 0.6);
      g.fillStyle(0xa3a3a3, 1);
      g.fillEllipse(cx - 4, cy - 2, TILE * 0.4, TILE * 0.25);
      g.lineStyle(2, 0x4d4d4d, 1);
      g.strokeEllipse(cx, cy + 2, TILE * 0.8, TILE * 0.6);
      break;
  }
}

/** A grown field is soil with rows of ripe wheat; a growing one is darker soil with green sprouts. */
function drawField(g: Phaser.GameObjects.Graphics, field: Field, growing: boolean) {
  const left = field.x * TILE;
  const top = field.y * TILE;
  g.fillStyle(growing ? 0x5e3d22 : 0x7a5230, 1);
  g.fillRect(left + 1, top + 1, TILE - 2, TILE - 2);
  if (growing) {
    g.fillStyle(0x7cc04a, 1);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        g.fillRect(left + 5 + col * 7, top + 4 + row * 8, 2, 4);
      }
    }
    return;
  }
  g.fillStyle(0xe0c040, 1);
  for (let stripe = 0; stripe < 4; stripe++) {
    g.fillRect(left + 4 + stripe * 7, top + 4, 3, TILE - 8);
  }
}

export function createGame(parent: HTMLElement, options: WorldOptions): World {
  const { region } = options.character;
  const size = isRegionId(region) ? REGIONS[region] : { width: 1, height: 1 };
  const scene = new WorldScene(options);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: size.width * TILE,
    height: size.height * TILE,
    pixelArt: true,
    backgroundColor: "#2d4a22",
    // Stretch the map to fill its box on the page, keeping its shape, so it grows with the window.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
  // The box resizes with the page layout (e.g. when panels open or close), not only when the
  // window resizes. Phaser maps clicks to tiles using the canvas's on-screen size, so
  // re-measure whenever it changes, or clicks land on the wrong tile.
  const resizes = new ResizeObserver(() => game.scale.refresh());
  resizes.observe(parent);
  return {
    setJob: (job) => scene.setJob(job),
    setFields: (fields) => scene.setFields(fields),
    setVillagers: (villagers) => scene.setVillagers(villagers),
    setBuildings: (buildings) => scene.setBuildings(buildings),
    setOthers: (others) => scene.setOthers(others),
    setPlacing: (kind) => scene.setPlacing(kind),
    destroy: () => {
      resizes.disconnect();
      game.destroy(true);
    },
  };
}
