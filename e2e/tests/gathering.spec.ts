import { expect, test } from "@playwright/test";
import { deletePlayers } from "./cleanup.ts";
import { clickTile, FARM, ROCK, signUp, TREE } from "./helpers.ts";

test.afterEach(deletePlayers);

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
