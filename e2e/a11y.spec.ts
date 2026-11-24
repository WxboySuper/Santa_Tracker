import { expect, test } from "./fixtures";
import { getFixtureProjectName } from "./fixture-project";
import { expectNoSeriousAxeIssues } from "./axe-check";

test("key public pages pass serious and critical axe checks", async ({ page }, testInfo) => {
  test.skip(getFixtureProjectName(testInfo.project) !== "open", "public route accessibility checks run with the open fixtures");

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Santa Tracker" })).toBeVisible();
  await expectNoSeriousAxeIssues(page);

  await page.goto("/tracker");
  await expect(page.getByRole("button", { name: "Show text view" })).toBeVisible();
  await expect(page.getByRole("application")).toBeVisible();
  await expectNoSeriousAxeIssues(page);
  await page.getByRole("button", { name: "Show text view" }).click();
  await expect(page.getByRole("region", { name: "Show text view" })).toBeVisible();
  await expectNoSeriousAxeIssues(page);

  await page.goto("/advent");
  await expect(page.getByRole("list", { name: /advent calendar/i }).getByRole("listitem")).toHaveCount(24);
  await expectNoSeriousAxeIssues(page);

  await page.goto("/village?view=static");
  await expect(page.getByRole("img", { name: /snowy North Pole village/i })).toBeVisible();
  await expectNoSeriousAxeIssues(page);
});
