import Phaser from "phaser";

const TILE = 32;
const MAP_TILES = { width: 25, height: 18 } as const;

type WorldData = { characterName: string };

/** Placeholder world: a grass grid and a welcome. The character and movement arrive in issue #17. */
class WorldScene extends Phaser.Scene {
  private readonly world: WorldData;

  constructor(world: WorldData) {
    super("world");
    this.world = world;
  }

  create() {
    const grid = this.add.graphics();
    for (let y = 0; y < MAP_TILES.height; y++) {
      for (let x = 0; x < MAP_TILES.width; x++) {
        grid.fillStyle((x + y) % 2 === 0 ? 0x4a7a3a : 0x52863f, 1);
        grid.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        `Welcome to the heartland, ${this.world.characterName}`,
        {
          fontFamily: "Georgia, serif",
          fontSize: "20px",
          color: "#f5e9c8",
          backgroundColor: "#00000088",
          padding: { x: 12, y: 8 },
        },
      )
      .setOrigin(0.5);
  }
}

export function createGame(parent: HTMLElement, world: WorldData): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: MAP_TILES.width * TILE,
    height: MAP_TILES.height * TILE,
    pixelArt: true,
    backgroundColor: "#2d4a22",
    scene: new WorldScene(world),
  });
}
