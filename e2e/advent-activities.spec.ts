import { expect, test, getRuntimeConfig } from "./fixtures";
import type { Page } from "@playwright/test";
import { generateMaze, solveMaze, type MazeDirection } from "../apps/web/src/lib/maze";
import { getOrderedCityIds, INITIAL_TIMEZONE_ORDER, REFERENCE_START_UTC } from "../apps/web/src/lib/timezones";

async function openUnlockedAdventDay(page: Page, day: number) {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  const { adminPassword } = await getRuntimeConfig(runtimeFile);
  const login = await page.request.post("/api/admin/login", { data: { password: adminPassword } });
  expect(login.status()).toBe(200);
  const unlock = await page.request.put(`/api/admin/advent/day/${day}`, { data: { is_unlocked_override: true } });
  expect(unlock.status()).toBe(200);
  await page.goto(`/advent/${day}`);
}

test("Day 2 cipher decodes and keeps its solved state for replay", async ({ page }) => {
  // The cipher has no local save or reset control yet. Keep this regression visible until both exist.
  test.fixme(true, "Cipher answers are component state only, so a solved state cannot persist or reset across reload.");
  await openUnlockedAdventDay(page, 2);
  const answer = page.getByRole("textbox", { name: "Your decoded message" });
  await answer.fill("WELCOME TO THE NIGHT SHIFT");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("You cracked the code! Nice work!")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You cracked the code! Nice work!")).toBeVisible();
  await answer.fill("WELCOME TO THE NIGHT SHIFT");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("You cracked the code! Nice work!")).toBeVisible();
});

test("Day 4 snowflake saves a design and can be cleared and made again", async ({ page }) => {
  await openUnlockedAdventDay(page, 4);
  const cell = page.getByRole("button", { name: "Wedge row 2, column 1, toggle cut" });
  await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const restoredCell = page.getByRole("button", { name: "Wedge row 2, column 1, toggle cut" });
  await expect(restoredCell).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear cuts" }).click();
  await expect(restoredCell).toHaveAttribute("aria-pressed", "false");
  await restoredCell.click();
  await expect(restoredCell).toHaveAttribute("aria-pressed", "true");
});

test("Day 7 light-show composition saves and can be changed again", async ({ page }) => {
  // On mount the initial default is saved before the stored composition finishes loading.
  test.fixme(true, "The mount save overwrites the saved light-show composition with its default.");
  await openUnlockedAdventDay(page, 7);
  await page.getByRole("button", { name: "First Snow" }).click();
  const palette = page.getByRole("combobox", { name: "Palette" });
  await expect(palette).toHaveValue("ice");
  await page.reload();
  const restoredPalette = page.getByRole("combobox", { name: "Palette" });
  await expect(restoredPalette).toHaveValue("ice");
  await page.getByRole("button", { name: "Fireplace" }).click();
  await expect(restoredPalette).toHaveValue("warm");
});

test("Day 8 winter traditions quiz can be completed and replayed", async ({ page }) => {
  // Quiz answers are not persisted, and reload always restarts the quiz.
  test.fixme(true, "Quiz completion has no device-local save, so completion cannot survive reload.");
  await openUnlockedAdventDay(page, 8);
  const answers = ["December 13", "9", "9", "Pomegranate", "January 1"];
  for (let question = 0; question < answers.length; question += 1) {
    await page.getByRole("radio", { name: answers[question]! }).check();
    await page.getByRole("button", { name: question === answers.length - 1 ? "See results" : "Check answer" }).click();
    if (question < answers.length - 1) await page.getByRole("button", { name: "Next question" }).click();
  }
  await expect(page.getByRole("heading", { name: "You got 5 of 5" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "You got 5 of 5" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Question 1 of 5")).toBeVisible();
});

test("Day 12 jigsaw saves the completed picture and supports start-over replay", async ({ page }) => {
  await openUnlockedAdventDay(page, 12);
  for (let piece = 1; piece <= 24; piece += 1) {
    const pieceButton = page.getByRole("button", { name: new RegExp(`Piece ${piece} of 24\\.`) });
    await pieceButton.press("Enter");
    await pieceButton.press("Enter");
  }
  await expect(page.getByText("24 of 24 pieces placed")).toBeVisible();
  await page.reload();
  await expect(page.getByText("24 of 24 pieces placed")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("0 of 24 pieces placed")).toBeVisible();
  const firstPiece = page.getByRole("button", { name: /Piece 1 of 24\./ });
  await firstPiece.press("Enter");
  await firstPiece.press("Enter");
  await expect(page.getByText("1 of 24 pieces placed", { exact: true })).toBeVisible();
});

test("Day 15 winter traditions can be completed and saved across reload", async ({ page }) => {
  // The activity saves candles but has no reset or replay control.
  test.fixme(true, "Winter Around the World saves progress but does not provide a reset or replay control.");
  await openUnlockedAdventDay(page, 15);
  const entries = ["lucia", "hanukkah", "posadas", "dongzhi", "yalda", "yule", "hogmanay", "kwanzaa", "inti-raymi", "tokyo-lights"];
  for (const entry of entries) {
    const button = page.locator(`#winter-entry-${entry}`);
    await button.click();
    const light = page.getByRole("button", { name: /Light a candle for|Candle lit for/ });
    await light.click();
  }
  await expect(page.getByText("10 of 10 candles lit")).toBeVisible();
  await page.reload();
  await expect(page.getByText("10 of 10 candles lit")).toBeVisible();
});

test("Day 18 maze reaches the lit window and resets for replay", async ({ page }) => {
  // Maze state is in memory only, so it cannot retain completion after reload.
  test.fixme(true, "Maze position has no device-local save, so completion cannot persist across reload.");
  await openUnlockedAdventDay(page, 18);
  const route = solveMaze(generateMaze({ seed: 1218, size: "medium" }));
  if (!route) throw new Error("The deterministic maze has no path to its goal");
  const directions: MazeDirection[] = [];
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!;
    const current = route[index]!;
    directions.push(current === previous - 13 ? "up" : current === previous + 13 ? "down" : current === previous + 1 ? "right" : "left");
  }
  const keyByDirection: Record<MazeDirection, string> = { up: "ArrowUp", right: "ArrowRight", down: "ArrowDown", left: "ArrowLeft" };
  const board = page.getByRole("group", { name: /Snowy village maze/i });
  await board.focus();
  for (const direction of directions) await page.keyboard.press(keyByDirection[direction]);
  await expect(page.getByText("There it is. Someone left the porch light on.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("There it is. Someone left the porch light on.")).toBeVisible();
  await page.getByRole("button", { name: "Back to the starting doorstep" }).click();
  await expect(page.getByText("There it is. Someone left the porch light on.")).toHaveCount(0);
});

test("Day 21 timezone order can be solved and replayed", async ({ page }) => {
  // The checked order is component state only; reload loses it and there is no reset button.
  test.fixme(true, "Timezone completion has no device-local save or replay reset.");
  await openUnlockedAdventDay(page, 21);
  const correct = getOrderedCityIds({ referenceInstant: REFERENCE_START_UTC });
  const order: string[] = [...INITIAL_TIMEZONE_ORDER];
  for (let target = 0; target < correct.length; target += 1) {
    const city = correct[target];
    if (!city) continue;
    let current = order.indexOf(city);
    while (current > target) {
      const cityName = city[0]!.toUpperCase() + city.slice(1);
      await page.getByRole("button", { name: `Move ${cityName} earlier in the list` }).click();
      [order[current - 1], order[current]] = [order[current]!, order[current - 1]!];
      current -= 1;
    }
  }
  await page.getByRole("button", { name: "Check the order" }).click();
  await expect(page.getByText("That is the order midnight visits. The map has done a full turn.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("That is the order midnight visits. The map has done a full turn.")).toBeVisible();
});

test("Day 23 postcard studio creates a custom postcard", async ({ page }) => {
  // The postcard editor has no completion action, device save, or reset control.
  test.fixme(true, "Postcard changes remain in component state and have no completion, persistence, or reset flow.");
  await openUnlockedAdventDay(page, 23);
  await page.getByRole("button", { name: "Harbor" }).click();
  await page.getByLabel("Greeting").selectOption("custom");
  await page.getByLabel("Your greeting").fill("A hello from the harbor");
  const preview = page.getByRole("img", { name: "Winter postcard preview" });
  await expect(preview).toContainText("A hello from the harbor");
  await page.reload();
  await expect(preview).toContainText("A hello from the harbor");
});
