import { travelZonesIn } from "@nf/shared";
import { expect, test } from "@playwright/test";
import { deletePlayers } from "./cleanup.ts";
import { clickTile, serverState, signUp } from "./helpers.ts";

test.afterEach(deletePlayers);

test("a player walks onto a travel zone and arrives in the next section", async ({ page }) => {
  test.setTimeout(60_000);
  await test.step("sign up", () => signUp(page));
  type Here = { character: { region: string } };
  const home = (await serverState<Here>(page)).character.region;
  const [zone] = travelZonesIn(home);
  if (!zone) throw new Error(`${home} has no travel zone`);

  await test.step(`walk onto the zone toward ${zone.to}`, async () => {
    await clickTile(page, { x: zone.tiles.x, y: zone.tiles.y });
  });

  await test.step("about 5 seconds later the character is in the next section", async () => {
    await expect
      .poll(async () => (await serverState<Here>(page)).character.region, { timeout: 30_000 })
      .toBe(zone.to);
    await expect(page.locator("canvas")).toBeVisible();
  });

  await test.step("the World view shows the 10 sections, home and where the player is", async () => {
    await page.getByRole("button", { name: "World" }).click();
    const sections = page.getByRole("list", { name: "Sections" }).getByRole("listitem");
    await expect(sections).toHaveCount(10);
    await expect(sections.filter({ hasText: "Your home" })).toHaveCount(1);
    await expect(sections.filter({ hasText: "You are here" })).toHaveCount(1);
    await page.getByRole("button", { name: "Close world" }).click();
    await expect(page.getByRole("list", { name: "Sections" })).toHaveCount(0);
  });
});
