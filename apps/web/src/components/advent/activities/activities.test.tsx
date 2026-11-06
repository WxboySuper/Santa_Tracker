import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MazeActivity, MAZE_DPAD_LAYOUT } from "./maze-component";
import { WordsearchActivity } from "./wordsearch-component";

describe("Advent activity rendering safeguards", () => {
  it("replaces an unplaceable word search with a friendly message", () => {
    const html = renderToStaticMarkup(createElement(WordsearchActivity, {
      config: { seed: 4, words: ["THISWORDCANNOTFITINAGRID"] },
      locale: "en",
    }));
    expect(html).toContain("This word search could not be laid out.");
    expect(html).not.toContain("THISWORDCANNOTFITINAGRID");
  });

  it("renders the maze directional controls in the declared three-by-three layout", () => {
    const html = renderToStaticMarkup(createElement(MazeActivity, {
      config: { seed: 18, size: "small" },
      locale: "en",
    }));
    expect(MAZE_DPAD_LAYOUT).toHaveLength(9);
    expect(html).toContain('aria-label="Move south"');
    expect(html).toContain('aria-label="Move west"');
    expect(html).toContain('aria-label="Move east"');
  });
});
