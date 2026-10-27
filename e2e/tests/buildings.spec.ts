import { expect, type Page, test } from "@playwright/test";
import { deletePlayers } from "./cleanup.ts";
import { clickTile, OPEN_SPOT, serverState, signUp, TREE } from "./helpers.ts";

test.afterEach(deletePlayers);

async function buildings(page: Page) {
  return (await serverState<{ buildings: { kind: string }[] }>(page)).buildings;
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
    expect((await buildings(page)).filter((b) => b.kind === "house")).toHaveLength(2);
  });

  await test.step("remove it: the 5 wood come back", async () => {
    await build.getByRole("button", { name: "Remove House at 17,13" }).click();
    await expect(inventory.getByRole("listitem")).toHaveText(["Wood 5/5"]);
    expect((await buildings(page)).filter((b) => b.kind === "house")).toHaveLength(1);
  });
});
