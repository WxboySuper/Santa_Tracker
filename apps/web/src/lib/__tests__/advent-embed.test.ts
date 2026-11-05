import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderDayContent } from "@/components/advent/day-content";
import { loadAdventCalendar, validateAdventCalendar } from "../advent";
import { safeEmbedPath } from "../advent-ui";
import type { AdventPublicDay } from "../advent";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("safeEmbedPath", () => {
  it("accepts a same-origin path under /advent/", () => {
    expect(safeEmbedPath("/advent/ornament-smash/index.html")).toBe("/advent/ornament-smash/index.html");
  });

  it.each([
    ["an absolute URL", "https://evil.example/game.html"],
    ["a protocol-relative URL", "//evil.example/advent/x.html"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a path outside /advent/", "/admin/index.html"],
    ["the bare prefix of another route", "/adventure/x.html"],
    ["traversal", "/advent/../admin/index.html"],
    ["an encoded-looking scheme", "/advent/x:y.html"],
    ["a backslash", "/advent/x\\y.html"],
    ["a doubled slash", "/advent//evil.example/x.html"],
    ["a query string", "/advent/x.html?next=//evil.example"],
    ["a fragment", "/advent/x.html#frag"],
    ["whitespace", "/advent/x y.html"],
    ["a tab", "/advent/x\ty.html"],
    ["a NUL byte", "/advent/x\u0000y.html"],
    ["a Unicode space", "/advent/x y.html"],
    ["an overlong path", `/advent/${"a".repeat(300)}`],
    ["a non-string", 42],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(safeEmbedPath(value)).toBeNull();
  });
});

function day(overrides: Partial<AdventPublicDay>): AdventPublicDay {
  return {
    day: 1,
    title: "Ornament Smash",
    unlock_time: "2026-12-01T12:00:00Z",
    content_type: "game",
    is_unlocked: true,
    payload: { url: "/advent/ornament-smash/index.html" },
    ...overrides,
  };
}

const render = (d: AdventPublicDay) =>
  renderToStaticMarkup(renderDayContent(d, createElement("p", null, "FALLBACK")));

describe("renderDayContent: game", () => {
  it("embeds a safe path in a titled iframe", () => {
    const html = render(day({}));
    expect(html).toContain("<iframe");
    expect(html).toContain('src="/advent/ornament-smash/index.html"');
    expect(html).toContain('title="Ornament Smash"');
  });

  it("falls back instead of embedding an unsafe or missing URL", () => {
    expect(render(day({ payload: { url: "https://evil.example/" } }))).toContain("FALLBACK");
    expect(render(day({ payload: { url: "javascript:alert(1)" } }))).toContain("FALLBACK");
    expect(render(day({ payload: {} }))).toContain("FALLBACK");
    expect(render(day({ payload: undefined }))).toContain("FALLBACK");
    expect(render(day({ payload: { url: "https://evil.example/" } }))).not.toContain("<iframe");
  });
});

describe("checked-in Advent calendar", () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/advent_calendar.json");

  it("has 24 valid days with no structural errors", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    expect(days).toHaveLength(24);
    expect(validateAdventCalendar(days).errors).toEqual([]);
  });

  it("unlocks day N at 12:00 UTC on Dec N, the last midnight on Earth (UTC-12), so no one sees a door early", async () => {
    const days = await loadAdventCalendar({ filePath: file });
    for (const d of days) {
      expect(d.unlock_time).toBe(`2026-12-${String(d.day).padStart(2, "0")}T12:00:00Z`);
    }
  });

  it("makes Day 1 the Ornament Smash embed pointing at a file that is shipped", async () => {
    const [first] = await loadAdventCalendar({ filePath: file });
    expect(first?.content_type).toBe("game");
    const url = safeEmbedPath(first?.payload?.url);
    expect(url).toBe("/advent/ornament-smash/index.html");
    const publicFile = path.resolve(path.dirname(file), "..", "public", url!.slice(1));
    const { existsSync } = await import("node:fs");
    expect(existsSync(publicFile)).toBe(true);
  });
});
