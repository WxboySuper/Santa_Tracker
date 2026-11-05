import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderDayContent } from "@/components/advent/day-content";
import type { AdventPublicDay } from "../advent";

function day(overrides: Partial<AdventPublicDay>): AdventPublicDay {
  return {
    day: 1,
    title: "Day 1",
    unlock_time: "2026-12-01T00:00:00Z",
    content_type: "fact",
    is_unlocked: true,
    payload: { text: "Reindeer eyes change colour in winter." },
    ...overrides,
  };
}

const render = (d: AdventPublicDay) =>
  renderToStaticMarkup(renderDayContent(d, createElement("p", null, "FALLBACK")));

describe("renderDayContent", () => {
  it("renders a fact payload", () => {
    expect(render(day({}))).toContain("Reindeer eyes change colour in winter.");
  });

  it("falls back for a content type with no renderer yet", () => {
    expect(render(day({ content_type: "quiz" }))).toContain("FALLBACK");
  });

  it("falls back when a fact has no usable text", () => {
    expect(render(day({ payload: { text: "   " } }))).toContain("FALLBACK");
    expect(render(day({ payload: undefined }))).toContain("FALLBACK");
    expect(render(day({ payload: { text: 42 } }))).toContain("FALLBACK");
  });

  it("escapes markup in payload text instead of injecting it", () => {
    const html = render(day({ payload: { text: "<script>alert(1)</script>" } }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
