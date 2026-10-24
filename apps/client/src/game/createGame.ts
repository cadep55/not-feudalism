import { type CharacterState, isRegionId, REGIONS } from "@nf/shared";
import Phaser from "phaser";
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
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
};

type MovementKeys = Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key[]>;

/**
 * The player's character on the region map. Walks one tile per step at the
 * server's speed (click a tile, or hold arrows/WASD) and reports positions to
 * the server, snapping back if it refuses.
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
  private avatar!: Phaser.GameObjects.Container;
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
  }

  create() {
    const grid = this.add.graphics();
    for (let y = 0; y < this.region.height; y++) {
      for (let x = 0; x < this.region.width; x++) {
        grid.fillStyle((x + y) % 2 === 0 ? 0x4a7a3a : 0x52863f, 1);
        grid.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
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
    this.avatar = this.add.container(...this.pixelsOf(this.position), [body, label]);

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
      if (tile) this.destination = tile;
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
    if (usingKeys) this.destination = null;

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
  }

  private stepTo(next: Tile) {
    this.stepping = true;
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

export function createGame(parent: HTMLElement, options: WorldOptions): Phaser.Game {
  const { region } = options.character;
  const size = isRegionId(region) ? REGIONS[region] : { width: 1, height: 1 };
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: size.width * TILE,
    height: size.height * TILE,
    pixelArt: true,
    backgroundColor: "#2d4a22",
    scene: new WorldScene(options),
  });
}
