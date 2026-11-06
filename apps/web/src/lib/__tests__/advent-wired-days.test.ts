import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderDayContent } from "@/components/advent/day-content";
import { loadAdventCalendar } from "../advent";
import type { AdventPublicDay } from "../advent";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/advent_calendar.json");
const WIRED_DAYS = [1, 2, 7, 8, 12, 15];

function render(day: AdventPublicDay): string {
  return renderToStaticMarkup(renderDayContent({ ...day, is_unlocked: true }, createElement("p", null, "FALLBACK")));
}

describe("wired Advent days", () => {
  it("render their own content instead of the fallback", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    for (const number of WIRED_DAYS) {
      const day = days.find((candidate) => candidate.day === number);
      expect(day, `day ${number} exists`).toBeDefined();
      expect(render(day as AdventPublicDay), `day ${number} renders`).not.toContain("FALLBACK");
    }
  });
});
