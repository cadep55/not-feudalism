import { expect, test } from "@playwright/test";
import { deletePlayers } from "./cleanup.ts";
import { clickTile, STOREHOUSE, signUp, TREE } from "./helpers.ts";

test.afterEach(deletePlayers);

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

test("a player sends a villager for wood from the dropdown", async ({ page }) => {
  // The delivery itself takes about a minute of real time; the villager integration tests
  // check it with a fake clock (apps/server/src/game/villagers.int.test.ts).
  await test.step("sign up", () => signUp(page));
  const villagers = page.getByRole("region", { name: "Villagers" });

  await test.step("the house holds 3 idle villagers (in the map's top-left dropdown)", async () => {
    await page.getByRole("button", { name: /Villagers/ }).click();
    await expect(villagers.getByRole("listitem")).toHaveCount(3);
    for (const row of await villagers.getByRole("listitem").all()) {
      await expect(row).toContainText("Idle");
    }
  });

  await test.step("send the first villager for wood", async () => {
    await villagers.getByRole("combobox").first().selectOption("wood");
    await expect(villagers.getByRole("listitem").first()).toContainText("Gathering wood");
    await expect(page.getByRole("button", { name: /Villagers \(1\/3 working\)/ })).toBeVisible();
  });
});
