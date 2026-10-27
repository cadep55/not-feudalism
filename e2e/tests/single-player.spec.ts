import { randomUUID } from "node:crypto";
import { travelZonesIn } from "@nf/shared";
import { expect, type Page, test } from "@playwright/test";
import { serverURL } from "../playwright.config.ts";
import { deletePlayers, rememberPlayer } from "./cleanup.ts";

test.afterEach(deletePlayers);

// Must match apps/client/src/game/createGame.ts and shared REGIONS.heartland.
const TILE = 32;
const MAP_WIDTH_TILES = 25;

type Position = { x: number; y: number };

/** Where the server says the character is. Uses the page's session cookie. */
async function serverPosition(page: Page): Promise<Position> {
  const res = await page.request.get(`${serverURL}/game/state`);
  expect(res.ok()).toBe(true);
  const { state } = (await res.json()) as { state: { character: Position } };
  return { x: state.character.x, y: state.character.y };
}

async function serverFacing(page: Page): Promise<string> {
  const res = await page.request.get(`${serverURL}/game/state`);
  const { state } = (await res.json()) as { state: { character: { facing: string } } };
  return state.character.facing;
}

async function clickTile(page: Page, tile: Position) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas not on screen");
  // The canvas may be scaled down by CSS to fit the window.
  const scale = box.width / (MAP_WIDTH_TILES * TILE);
  await page.mouse.click(
    box.x + (tile.x + 0.5) * TILE * scale,
    box.y + (tile.y + 0.5) * TILE * scale,
  );
}

async function expectInGame(page: Page, characterName: string) {
  await expect(page.locator("header strong")).toHaveText(characterName);
  await expect(page.locator("canvas")).toBeVisible();
}

/** Signs up a fresh player (unique per test) and waits for the game screen. */
async function signUp(page: Page) {
  const id = randomUUID().slice(0, 8);
  const player = {
    email: `e2e-${id}@example.test`,
    password: "correct horse battery",
    name: `E2e${id}`,
  };
  rememberPlayer(player.email);
  await page.goto("/");
  await page.getByRole("tab", { name: "Sign up" }).click();
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill(player.password);
  await page.getByLabel("Character name").fill(player.name);
  await page.getByRole("button", { name: "Create character" }).click();
  await expectInGame(page, player.name);
  return player;
}

test("a new player walks around, and the game remembers where they stopped", async ({ page }) => {
  const player = await test.step("sign up", () => signUp(page));

  const spawn = await serverPosition(page);

  await test.step("walk east with the keyboard", async () => {
    // Holding a key is how players walk; one second is about four tiles.
    await page.keyboard.down("d");
    await page.waitForTimeout(1_000);
    await page.keyboard.up("d");
    await expect
      .poll(async () => (await serverPosition(page)).x, { timeout: 5_000 })
      .toBeGreaterThan(spawn.x);
    // Walking sets the character's front (issue #28).
    expect(await serverFacing(page)).toBe("e");
  });

  const destination = { x: 3, y: 3 };
  await test.step("click a tile to walk there", async () => {
    await clickTile(page, destination);
    await expect.poll(() => serverPosition(page), { timeout: 10_000 }).toEqual(destination);
  });

  await test.step("reload: still there", async () => {
    await page.reload();
    await expectInGame(page, player.name);
    expect(await serverPosition(page)).toEqual(destination);
  });

  await test.step("log out and back in: still there", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByLabel("Email").fill(player.email);
    await page.getByLabel("Password").fill(player.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expectInGame(page, player.name);
    expect(await serverPosition(page)).toEqual(destination);
  });
});

// Must match RESOURCE_NODES in packages/shared/src/data/resources.ts.
const TREE = { x: 5, y: 5 };
const FARM = { x: 13, y: 14 };

test("a player gathers wood from the tree, and needs a rake for wheat", async ({ page }) => {
  await test.step("sign up", () => signUp(page));
  const inventory = page.getByRole("region", { name: "Inventory" });
  await expect(inventory).toContainText("Empty");

  await test.step("click the tree: walk over and gather for 3 seconds", async () => {
    await clickTile(page, TREE);
    await expect(inventory.getByRole("status")).toHaveText("Gathering wood…", { timeout: 10_000 });
    await expect(inventory.getByRole("listitem")).toHaveText(["Wood 1/5"], { timeout: 10_000 });
    await expect(inventory.getByRole("status")).toHaveCount(0);
  });

  await test.step("reload: the wood is still there", async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: "Inventory" }).getByRole("listitem")).toHaveText([
      "Wood 1/5",
    ]);
  });

  await test.step("click the farm without a rake: told what's missing", async () => {
    await clickTile(page, FARM);
    await expect(page.getByRole("alert")).toHaveText("You need a rake to harvest wheat.", {
      timeout: 15_000,
    });
  });
});

const ROCK = { x: 19, y: 4 };

test("the core loop: gather wood and stone, craft a rake, harvest wheat", async ({ page }) => {
  test.setTimeout(90_000);
  await test.step("sign up", () => signUp(page));
  const inventory = page.getByRole("region", { name: "Inventory" });
  const count = (name: string) =>
    inventory.getByRole("listitem").filter({ hasText: name }).locator(".count");

  await test.step("gather 2 wood", async () => {
    await clickTile(page, TREE);
    await expect(count("Wood")).toHaveText("1/5", { timeout: 15_000 });
    await clickTile(page, TREE);
    await expect(count("Wood")).toHaveText("2/5", { timeout: 15_000 });
  });

  await test.step("gather 1 stone", async () => {
    await clickTile(page, ROCK);
    await expect(count("Stone")).toHaveText("1/5", { timeout: 20_000 });
  });

  await test.step("craft the rake (takes the wood and stone)", async () => {
    await page.getByRole("button", { name: "Craft Rake" }).click();
    await expect(count("Rake")).toHaveText("1/5", { timeout: 15_000 });
    await expect(count("Wood")).toHaveCount(0);
    await expect(count("Stone")).toHaveCount(0);
  });

  await test.step("harvest wheat with the rake", async () => {
    await clickTile(page, FARM);
    await expect(count("Wheat")).toHaveText("1/5", { timeout: 20_000 });
  });

  await test.step("no seeds yet, so planting is off (a seed drops every 10th harvest)", async () => {
    const farming = page.getByRole("region", { name: "Farming" });
    await expect(farming).toContainText("Wheat seeds: 0");
    await expect(farming.getByRole("button", { name: "Plant seed" })).toBeDisabled();
  });
});

// Must match BUILDINGS.heartland_storehouse in packages/shared/src/data/buildings.ts.
const STOREHOUSE = { x: 15, y: 8 };

test("a player stores wood in the storehouse and takes it back", async ({ page }) => {
  test.setTimeout(60_000);
  await test.step("sign up", () => signUp(page));
  const inventory = page.getByRole("region", { name: "Inventory" });
  const storehouse = page.getByRole("region", { name: "Storehouse" });

  await test.step("gather a wood", async () => {
    await clickTile(page, TREE);
    await expect(inventory.getByRole("listitem")).toHaveText(["Wood 1/5"], { timeout: 15_000 });
  });

  await test.step("away from the storehouse, it stays closed", async () => {
    await expect(storehouse).toHaveCount(0);
  });

  await test.step("click the storehouse: it opens over the map, then store the wood", async () => {
    await clickTile(page, STOREHOUSE);
    const store = storehouse.getByRole("button", { name: "Store Wood" });
    await expect(store).toBeEnabled({ timeout: 15_000 });
    await store.click();
    await expect(storehouse.getByRole("list", { name: "In the storehouse" })).toContainText(
      "Wood 1/100",
    );
    await expect(inventory.getByRole("listitem")).toHaveCount(0);
  });

  await test.step("take it back, then close the storehouse", async () => {
    await storehouse.getByRole("button", { name: "Take Wood" }).click();
    await expect(inventory.getByRole("listitem")).toHaveText(["Wood 1/5"]);
    await page.getByRole("button", { name: "Close storehouse" }).click();
    await expect(storehouse).toHaveCount(0);
  });
});

test("a villager sent for wood fills the storehouse", async ({ page }) => {
  // One full villager trip: walk out, gather 5 at 9 s each, walk to the storehouse.
  test.setTimeout(120_000);
  await test.step("sign up", () => signUp(page));
  const villagers = page.getByRole("region", { name: "Villagers" });
  const storehouse = page.getByRole("region", { name: "Storehouse" });

  await test.step("the house holds 3 idle villagers (in the map's top-left dropdown)", async () => {
    await page.getByRole("button", { name: /Villagers/ }).click();
    await expect(villagers.getByRole("listitem")).toHaveCount(3);
    for (const row of await villagers.getByRole("listitem").all()) {
      await expect(row).toContainText("Idle");
    }
  });

  await test.step("send the first villager for wood", async () => {
    const job = villagers.getByRole("combobox").first();
    await job.selectOption("wood");
    await expect(villagers.getByRole("listitem").first()).toContainText("Gathering wood");
  });

  await test.step("walk to the storehouse to watch it", async () => {
    await clickTile(page, STOREHOUSE);
    await expect(storehouse).toBeVisible({ timeout: 15_000 });
  });

  await test.step("about 50 seconds later, 5 wood are in the storehouse", async () => {
    await expect(storehouse.getByRole("list", { name: "In the storehouse" })).toContainText(
      "Wood 5/100",
      { timeout: 90_000 },
    );
  });
});

/**
 * Open grass with room for a 2x2 building and the clear tile around it, in
 * every section a new player can land in (the coast sections' sea starts at x 21).
 */
const OPEN_SPOT = { x: 17, y: 13 };

async function serverBuildings(
  page: Page,
): Promise<{ id: string; kind: string; x: number; y: number }[]> {
  const res = await page.request.get(`${serverURL}/game/state`);
  const { state } = (await res.json()) as {
    state: { buildings: { id: string; kind: string; x: number; y: number }[] };
  };
  return state.buildings;
}

test("a player builds a house from 5 wood, then removes it for a refund", async ({ page }) => {
  test.setTimeout(90_000);
  await test.step("sign up", () => signUp(page));
  const inventory = page.getByRole("region", { name: "Inventory" });
  const build = page.getByRole("region", { name: "Build" });

  await test.step("gather 5 wood", async () => {
    for (let n = 1; n <= 5; n++) {
      await clickTile(page, TREE);
      await expect(inventory.getByRole("listitem")).toHaveText([`Wood ${n}/5`], {
        timeout: 15_000,
      });
    }
  });

  await test.step("Build House, then click open grass to place it", async () => {
    await build.getByRole("button", { name: "Build House" }).click();
    await expect(build.getByRole("status")).toContainText("Click the map to place the house");
    await clickTile(page, OPEN_SPOT);
    await expect(build.getByText("Building a house…")).toBeVisible();
    await expect(inventory.getByRole("listitem")).toHaveCount(0);
  });

  await test.step("10 seconds later the house stands, and it's saved", async () => {
    const remove = build.getByRole("button", { name: "Remove House at 17,13" });
    await expect(remove).toBeVisible({ timeout: 15_000 });
    expect((await serverBuildings(page)).filter((b) => b.kind === "house")).toHaveLength(2);
  });

  await test.step("remove it: the 5 wood come back", async () => {
    await build.getByRole("button", { name: "Remove House at 17,13" }).click();
    await expect(inventory.getByRole("listitem")).toHaveText(["Wood 5/5"]);
    expect((await serverBuildings(page)).filter((b) => b.kind === "house")).toHaveLength(1);
  });
});

test("a player walks onto a travel zone and arrives in the next section", async ({ page }) => {
  test.setTimeout(60_000);
  await test.step("sign up", () => signUp(page));
  const res = await page.request.get(`${serverURL}/game/state`);
  const { state } = (await res.json()) as { state: { character: { region: string } } };
  const home = state.character.region;
  const [zone] = travelZonesIn(home);
  if (!zone) throw new Error(`${home} has no travel zone`);

  await test.step(`walk onto the zone toward ${zone.to}`, async () => {
    await clickTile(page, { x: zone.tiles.x, y: zone.tiles.y });
  });

  await test.step("about 5 seconds later the character is in the next section", async () => {
    await expect
      .poll(
        async () => {
          const now = await page.request.get(`${serverURL}/game/state`);
          return ((await now.json()) as { state: { character: { region: string } } }).state
            .character.region;
        },
        { timeout: 30_000 },
      )
      .toBe(zone.to);
    await expect(page.locator("canvas")).toBeVisible();
  });
});
