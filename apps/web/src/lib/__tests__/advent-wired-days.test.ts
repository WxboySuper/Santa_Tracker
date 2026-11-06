import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderDayContent } from "@/components/advent/day-content";
import { loadAdventCalendar, validateAdventCalendar } from "../advent";
import type { AdventPublicDay } from "../advent";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/advent_calendar.json");
const WIRED_DAYS = [1, 2, 7, 8, 12, 15];
const WRITTEN_DAYS = [3, 5, 6, 9, 10, 11, 14, 16, 17, 19, 20, 22, 24];
const STORY_DAYS = [3, 6, 9, 11, 14, 17, 20, 24];
const FACT_DAYS = [5, 10, 16, 19, 22];

function expectedContentType(dayNumber: number): "fact" | "story" {
  return STORY_DAYS.includes(dayNumber) ? "story" : "fact";
}

function expectedWordCount(dayNumber: number): [number, number] {
  return STORY_DAYS.includes(dayNumber) ? [250, 450] : [80, 160];
}

function assertWrittenDay(day: Awaited<ReturnType<typeof loadAdventCalendar>>[number], number: number): void {
  expect(day, `day ${number} exists`).toBeDefined();
  expect(day.content_type).toBe(expectedContentType(number));
  const text = day.payload.text;
  expect(typeof text, `day ${number} text is a string`).toBe("string");
  const words = (text as string).trim().split(/\s+/).filter(Boolean);
  const [minimum, maximum] = expectedWordCount(number);
  expect(words.length, `day ${number} word count`).toBeGreaterThanOrEqual(minimum);
  expect(words.length, `day ${number} word count`).toBeLessThanOrEqual(maximum);
  if (FACT_DAYS.includes(number)) {
    expect(typeof day.payload.source).toBe("string");
    expect((day.payload.source as string).trim().length).toBeGreaterThan(0);
  }
}

function assertCleanPunctuation(value: string): void {
  expect(value).not.toContain("\uFFFD");
  expect(value).not.toMatch(/[A-Za-z]\?[a-z]/);
  expect(value).not.toMatch(/(^|\s)\?[A-Za-z]/);
}

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

  it("keeps the full 24-day calendar valid with the scheduled unlock times", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    expect(days).toHaveLength(24);
    expect(new Set(days.map((day) => day.day)).size).toBe(24);
    expect(validateAdventCalendar(days).errors).toEqual([]);
    for (const day of days) {
      expect(day.unlock_time).toBe(`2026-12-${String(day.day).padStart(2, "0")}T12:00:00Z`);
    }
  });

  it("gives every authored story and fact non-empty text within its word limit", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    for (const number of WRITTEN_DAYS) {
      const day = days.find((candidate) => candidate.day === number);
      expect(day, `day ${number} exists`).toBeDefined();
      if (!day) continue;
      assertWrittenDay(day, number);
    }
  });

  it("keeps titles, text, and sources free of encoding damage", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    for (const day of days) {
      for (const value of [day.title, day.payload.text, day.payload.source]) {
        if (typeof value === "string") assertCleanPunctuation(value);
      }
    }
  });
});
