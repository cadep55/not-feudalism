import {
  type CharacterState,
  isRegionId,
  type Job,
  type NodeId,
  REGIONS,
  RESOURCE_NODES,
  type ResourceNode,
} from "@nf/shared";
import Phaser from "phaser";
import { jobProgress, nearestAdjacentTile, nodeAt, nodesIn, readyToGather } from "./gathering.ts";
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

/** What the server said about a position update. On refusal, where the character really is. */
export type MoveOutcome = { ok: true } | { ok: false; position: Tile; message: string };

export type WorldOptions = {
  character: CharacterState;
  /** The job in progress when the game starts; later changes arrive through World.setJob. */
  job: Job | null;
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  /** Asks the server to start gathering; the result comes back as a setJob call. */
  startGather: (nodeId: NodeId) => void;
};

/** What the React side holds on to: tell the world about job changes, tear it down. */
export type World = {
  setJob: (job: Job | null) => void;
  destroy: () => void;
};

type MovementKeys = Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key[]>;

/**
 * The player's character on the region map. Walks one tile per step at the
 * server's speed (click a tile, or hold arrows/WASD) and reports positions to
 * the server, snapping back if it refuses. Clicking a resource node walks next
 * to it, then asks the server to start gathering.
 */
class WorldScene extends Phaser.Scene {
  private readonly options: WorldOptions;
  private readonly region: RegionSize;
  private position: Tile;
  private destination: Tile | null = null;
  private stepping = false;
  private lastSent: Tile;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private inFlight = false;
  /** The node to gather at once the character stands next to it. */
  private gatherTarget: NodeId | null = null;
  private job: Job | null;
  private avatar!: Phaser.GameObjects.Container;
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

    // Nodes sit above the grass and below the character (drawing order sets depth).
    const nodes = this.add.graphics();
    for (const id of nodesIn(this.options.character.region)) {
      drawNode(nodes, RESOURCE_NODES[id]);
    }

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
      const nodeId = nodeAt(tile, this.options.character.region);
      if (!nodeId) {
        this.gatherTarget = null;
        this.destination = tile;
        return;
      }
      const approach = nearestAdjacentTile(this.position, RESOURCE_NODES[nodeId], this.region);
      this.gatherTarget = approach ? nodeId : null;
      this.destination = approach;
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
      this.gatherTarget = null;
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

    if (
      this.gatherTarget &&
      this.destination === null &&
      readyToGather({
        position: this.position,
        lastSent: this.lastSent,
        inFlight: this.inFlight,
        stepping: this.stepping,
        node: RESOURCE_NODES[this.gatherTarget],
      })
    ) {
      const nodeId = this.gatherTarget;
      this.gatherTarget = null;
      this.options.startGather(nodeId);
    }

    this.drawProgress();
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
    this.job = null;
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
      if (!outcome.ok) this.snapTo(outcome.position, outcome.message);
    });
  }

  /** The server refused a move: put the character back where the server says it is. */
  private snapTo(tile: Tile, message: string) {
    this.tweens.killTweensOf(this.avatar);
    this.stepping = false;
    this.destination = null;
    this.gatherTarget = null;
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
