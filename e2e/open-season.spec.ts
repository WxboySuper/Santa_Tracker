import { expect, test } from "./fixtures";
import { expectNoSeriousAxeIssues } from "./axe-check";

test("Advent exposes 24 doors, day 1 game, and rejects invalid days", async ({ page }) => {
  await page.goto("/advent");
  const calendar = page.getByRole("list", { name: /advent calendar/i });
  await expect(calendar.getByRole("listitem")).toHaveCount(24);
  await expect(calendar.getByRole("link", { name: /open day 1/i })).toBeVisible();
  await expect(calendar.getByRole("img")).toHaveCount(23);
  await expect(calendar.getByRole("img").first()).toHaveAttribute("aria-label", /Dec 2/);
  await expectNoSeriousAxeIssues(page);

  await page.goto("/advent/1");
  const game = page.getByTitle("Ornament Smash");
  await expect(game).toBeVisible();
  await expect.poll(() => game.evaluate((element) => (element as HTMLIFrameElement).contentDocument?.readyState)).toBe("complete");
  await expect.poll(() => game.evaluate((element) => (element as HTMLIFrameElement).contentDocument?.body?.children.length ?? 0)).toBeGreaterThan(0);
  const gameFrame = page.frameLocator('iframe[title="Ornament Smash"]');
  await gameFrame.getByRole("button", { name: "Start Game" }).click();
  await expect(gameFrame.locator("#gameHUD")).toBeVisible();
  await expect(gameFrame.getByText("20 Remaining")).toBeVisible();
  for (const route of ["/advent/25", "/advent/abc"]) {
    expect((await page.request.get(route)).status(), route).toBe(404);
  }
});
