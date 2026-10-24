import {
  BUILDINGS,
  type Building,
  type BuildingId,
  type CharacterState,
  type Direction,
  isRegionId,
  type Job,
  type NodeId,
  REGIONS,
  RESOURCE_NODES,
  type ResourceNode,
} from "@nf/shared";
import Phaser from "phaser";
import {
  approachTile,
  buildingAt,
  buildingsIn,
  readyAtBuilding,
  turnTowardBuilding,
} from "./buildings.ts";
import { arrowPlacement, facingAfterStep, turnBeforeGather } from "./facing.ts";
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

const TILE = 32;
/** The facing arrow is a hint, not a feature: keep it faint. */
const ARROW_ALPHA = 0.45;

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
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  /** Asks the server to start gathering; the result comes back as a setJob call. */
  startGather: (nodeId: NodeId) => void;
  /** Asks the server to turn the character in place; resolves true once it accepts. */
  turn: (facing: Direction) => Promise<boolean>;
  /** The character stands beside the storehouse facing it: show the storehouse panel. */
  openStorehouse: () => void;
};

/** What the React side holds on to: tell the world about job changes, tear it down. */
export type World = {
  setJob: (job: Job | null) => void;
  destroy: () => void;
};

/** Something the character walks up to and then uses: a resource node or a building. */
type Target = { kind: "node"; id: NodeId } | { kind: "building"; id: BuildingId };

type MovementKeys = Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key[]>;

/**
 * The player's character on the region map. Walks one tile per step at the
 * server's speed (click a tile, or hold arrows/WASD) and reports positions to
 * the server, snapping back if it refuses. The character faces the way it last
 * stepped, shown by a faint arrow. Clicking a resource node walks next to it,
 * turns toward it if needed, then asks the server to start gathering.
 * Clicking the storehouse does the same, then opens the storehouse panel.
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
  }

  /** The server's latest word on the character's job. Safe to call before the scene starts. */
  setJob(job: Job | null) {
    this.job = job;
  }

  create() {
    const grid = this.add.graphics();
    for (let y = 0; y < this.region.height; y++) {
      for (let x = 0; x < this.region.width; x++) {
        grid.fillStyle((x + y) % 2 === 0 ? 0x4a7a3a : 0x52863f, 1);
        grid.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Nodes and buildings sit above the grass and below the character (drawing order sets depth).
    const nodes = this.add.graphics();
    for (const id of nodesIn(this.options.character.region)) {
      drawNode(nodes, RESOURCE_NODES[id]);
    }
    const buildings = this.add.graphics();
    for (const id of buildingsIn(this.options.character.region)) {
      this.drawBuilding(buildings, BUILDINGS[id]);
    }

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

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const tile = tileAt(pointer.worldX, pointer.worldY, TILE, this.region);
      if (!tile) return;
      const { region } = this.options.character;
      const nodeId = nodeAt(tile, region);
      const buildingId = buildingAt(tile, region);
      this.turningToward = null;
      if (nodeId) {
        const approach = nearestAdjacentTile(this.position, RESOURCE_NODES[nodeId], this.region);
        this.target = approach ? { kind: "node", id: nodeId } : null;
        this.destination = approach;
      } else if (buildingId && BUILDINGS[buildingId].kind === "storehouse") {
        const approach = approachTile(this.position, BUILDINGS[buildingId], this.region);
        this.target = approach ? { kind: "building", id: buildingId } : null;
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
      if (next && !samePlace(next, this.position)) this.stepTo(next);
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

    this.drawProgress();
  }

  /** Standing still next to the target, with the server agreeing where we stand. */
  private readyFor(target: Target): boolean {
    const settled = {
      position: this.position,
      lastSent: this.lastSent,
      inFlight: this.inFlight,
      stepping: this.stepping,
    };
    return target.kind === "node"
      ? readyToGather({ ...settled, node: RESOURCE_NODES[target.id] })
      : readyAtBuilding({ ...settled, building: BUILDINGS[target.id] });
  }

  /**
   * Turn toward the target first when the server doesn't have us facing it,
   * then gather at the node or open the storehouse.
   */
  private use(target: Target) {
    const act =
      target.kind === "node"
        ? () => this.options.startGather(target.id)
        : () => this.options.openStorehouse();
    const toward =
      target.kind === "node"
        ? turnBeforeGather(this.position, RESOURCE_NODES[target.id], this.serverFacing)
        : turnTowardBuilding(this.position, BUILDINGS[target.id], this.serverFacing);
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

  /** A labelled square over the footprint until we have pixel art. */
  private drawBuilding(g: Phaser.GameObjects.Graphics, building: Building) {
    const style = BUILDING_STYLES[building.kind];
    const left = building.x * TILE;
    const top = building.y * TILE;
    const width = building.width * TILE;
    const height = building.height * TILE;
    g.fillStyle(style.fill, 1);
    g.fillRect(left + 2, top + 2, width - 4, height - 4);
    g.lineStyle(3, style.outline, 1);
    g.strokeRect(left + 2, top + 2, width - 4, height - 4);
    this.add
      .text(left + width / 2, top + height / 2, style.label, {
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
    // Walking away cancels a gather on the server; hide the bar now rather than on its reply.
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
    house: { fill: 0xa0472f, outline: 0x5c2414, label: "House" },
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
    case "farm":
      g.fillStyle(0x7a5230, 1);
      g.fillRect(left + 1, top + 1, TILE - 2, TILE - 2);
      g.fillStyle(0xe0c040, 1);
      for (let stripe = 0; stripe < 4; stripe++) {
        g.fillRect(left + 4 + stripe * 7, top + 4, 3, TILE - 8);
      }
      break;
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
    scene,
  });
  return {
    setJob: (job) => scene.setJob(job),
    destroy: () => game.destroy(true),
  };
}
