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

  it("renders a story's text payload the same way as a fact", () => {
    const html = render(day({ content_type: "story", payload: { text: "Once upon a snowy night." } }));
    expect(html).toContain("Once upon a snowy night.");
    expect(html).not.toContain("FALLBACK");
  });

  it("renders blank-line separated text as separate safe paragraphs", () => {
    const html = render(day({ payload: { text: "First paragraph.\n\nSecond <paragraph>." } }));
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second &lt;paragraph&gt;.</p>");
  });

  it("falls back for a content type with no renderer yet", () => {
    for (const content_type of ["video"] as const) {
      expect(render(day({ content_type }))).toContain("FALLBACK");
    }
  });

  it("renders one quiz question without revealing correctness", () => {
    const html = render(day({ content_type: "quiz", payload: { title: "Winter quiz", questions: [
      { prompt: "Which animal pulls Santa's sleigh?", choices: ["Reindeer", "Penguins", "Foxes"], answerIndex: 0 },
      { prompt: "Second question", choices: ["Snow", "Rain"], answerIndex: 1 },
    ] } }));
    expect(html).toContain("Winter quiz");
    expect(html).toContain("Question 1 of 2");
    expect(html).toContain("<legend");
    expect((html.match(/type="radio"/g) ?? [])).toHaveLength(3);
    expect(html).not.toContain("Correct!");
    expect(html).not.toContain("Not quite");
  });

  it("falls back for a malformed quiz payload", () => {
    expect(render(day({ content_type: "quiz", payload: { questions: [] } }))).toContain("FALLBACK");
  });

  it("renders a built-in cipher and falls back for invalid or unknown kinds", () => {
    expect(render(day({ content_type: "activity", payload: { kind: "cipher", message: "HELLO", shift: 3 } }))).toContain("KHOOR");
    expect(render(day({ content_type: "activity", payload: { kind: "cipher", message: "NO", shift: 3 } }))).toContain("FALLBACK");
    expect(render(day({ content_type: "activity", payload: { kind: "unknown" } }))).toContain("FALLBACK");
  });

  it("passes the requested locale to built-in activities", () => {
    const content = renderDayContent(day({
      content_type: "activity",
      payload: { kind: "cipher", message: "HELLO", shift: 3 },
    }), createElement("p", null, "FALLBACK"), "fr");
    expect(content).toMatchObject({ props: { locale: "fr" } });
  });

  it("keys built-in activities by Advent day", () => {
    const content = renderDayContent(day({
      day: 2,
      content_type: "activity",
      payload: { kind: "cipher", message: "HELLO", shift: 3 },
    }), createElement("p", null, "FALLBACK"));
    expect(content).toHaveProperty("key", "2");
  });

  it("uses the existing safe embed route for static activities", () => {
    expect(render(day({ content_type: "activity", payload: { url: "/advent/puzzle/index.html" } }))).toContain('src="/advent/puzzle/index.html"');
    expect(render(day({ content_type: "activity", payload: { url: "https://example.com" } }))).toContain("FALLBACK");
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

  it("links the literal /tracker token and leaves other text plain", () => {
    const html = render(day({ payload: { text: "Follow along at /tracker tonight." } }));
    expect(html).toContain('<a class="underline underline-offset-2" href="/tracker">/tracker</a>');
    expect(html).toContain("Follow along at ");
    expect(render(day({ payload: { text: "No link here." } }))).not.toContain("<a ");
  });
});
