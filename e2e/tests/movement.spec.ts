import { expect, test } from "@playwright/test";
import { deletePlayers } from "./cleanup.ts";
import { clickTile, expectInGame, serverFacing, serverPosition, signUp } from "./helpers.ts";

test.afterEach(deletePlayers);

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
