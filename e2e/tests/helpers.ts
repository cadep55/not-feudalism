import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { serverURL } from "../playwright.config.ts";
import { rememberPlayer } from "./cleanup.ts";

// Helpers shared by the e2e specs. One spec per area of the game, so a change
// can run just the specs it touches locally (AGENTS.md); CI runs them all.

// Must match apps/client/src/game/createGame.ts and shared REGIONS.heartland.
const TILE = 32;
const MAP_WIDTH_TILES = 25;

export type Position = { x: number; y: number };

/** Where the server says the character is. Uses the page's session cookie. */
export async function serverPosition(page: Page): Promise<Position> {
  const res = await page.request.get(`${serverURL}/game/state`);
  expect(res.ok()).toBe(true);
  const { state } = (await res.json()) as { state: { character: Position } };
  return { x: state.character.x, y: state.character.y };
}

export async function serverFacing(page: Page): Promise<string> {
  const res = await page.request.get(`${serverURL}/game/state`);
  const { state } = (await res.json()) as { state: { character: { facing: string } } };
  return state.character.facing;
}

export async function clickTile(page: Page, tile: Position) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas not on screen");
  // The canvas may be scaled down by CSS to fit the window.
  const scale = box.width / (MAP_WIDTH_TILES * TILE);
  await page.mouse.click(
    box.x + (tile.x + 0.5) * TILE * scale,
    box.y + (tile.y + 0.5) * TILE * scale,
  );
}

export async function expectInGame(page: Page, characterName: string) {
  await expect(page.locator("header strong")).toHaveText(characterName);
  await expect(page.locator("canvas")).toBeVisible();
}

/** Signs up a fresh player (unique per test) and waits for the game screen. */
export async function signUp(page: Page) {
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

// Must match RESOURCE_NODES in packages/shared/src/data/resources.ts (the same spots in every
// section a player can land in) and the starting base in packages/shared/src/data/buildings.ts.
export const TREE = { x: 5, y: 5 };
export const ROCK = { x: 19, y: 4 };
export const FARM = { x: 13, y: 14 };
export const STOREHOUSE = { x: 15, y: 8 };

/**
 * Open grass with room for a 2x2 building and the clear tile around it, in
 * every section a new player can land in (the coast sections' sea starts at x 21).
 */
export const OPEN_SPOT = { x: 17, y: 13 };

/** The character's state as the server has it. */
export async function serverState<T>(page: Page): Promise<T> {
  const res = await page.request.get(`${serverURL}/game/state`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { state: T }).state;
}
