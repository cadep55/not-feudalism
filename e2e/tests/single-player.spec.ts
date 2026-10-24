import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { serverURL } from "../playwright.config.ts";

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

test("a new player walks around, and the game remembers where they stopped", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const player = {
    email: `e2e-${id}@example.test`,
    password: "correct horse battery",
    name: `E2e${id}`,
  };

  await test.step("sign up", async () => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill(player.email);
    await page.getByLabel("Password").fill(player.password);
    await page.getByLabel("Character name").fill(player.name);
    await page.getByRole("button", { name: "Create character" }).click();
    await expectInGame(page, player.name);
  });

  const spawn = await serverPosition(page);

  await test.step("walk east with the keyboard", async () => {
    // Holding a key is how players walk; one second is about four tiles.
    await page.keyboard.down("d");
    await page.waitForTimeout(1_000);
    await page.keyboard.up("d");
    await expect
      .poll(async () => (await serverPosition(page)).x, { timeout: 5_000 })
      .toBeGreaterThan(spawn.x);
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
