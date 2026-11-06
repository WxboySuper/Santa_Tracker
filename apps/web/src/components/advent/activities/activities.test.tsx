import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MazeActivity, MAZE_DPAD_LAYOUT } from "./maze-component";
import { WordsearchActivity } from "./wordsearch-component";
import { JigsawActivity } from "./jigsaw-component";
import { LightshowActivity } from "./lightshow-component";
import { LightshowStage } from "./lightshow-stage";
import { WinterWorldActivity } from "./winter-world-component";
import { createTranslator } from "@santa-tracker/localization";

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

  it("keeps light-show status text readable on its dark stage", () => {
    const html = renderToStaticMarkup(createElement(LightshowActivity, {
      config: { scene: "tree" },
      locale: "en",
    }));
    expect(html).toContain("text-slate-200");
  });

  it("removes light transitions when reduced motion is requested", () => {
    const html = renderToStaticMarkup(createElement(LightshowStage, {
      composition: { scene: "tree", palette: "warm", pattern: "twinkle", speed: 3, brightness: 78 },
      tick: 1,
      reducedMotion: true,
      fullscreen: false,
      stageRef: { current: null },
      translator: createTranslator({ locale: "en" }),
      onFullscreenToggle: () => undefined,
    }));
    expect(html).toContain("transition:opacity 0ms ease-in-out");
  });

  it("keeps empty jigsaw cell numbers readable on the board", () => {
    const html = renderToStaticMarkup(createElement(JigsawActivity, {
      config: { scene: "cabin", pieces: 12 },
      locale: "en",
    }));
    expect(html).toContain("text-white/80");
  });

  it("uses the visible title and place as each winter-world list button name", () => {
    const html = renderToStaticMarkup(createElement(WinterWorldActivity, {
      config: {},
      locale: "en",
    }));
    const firstEntry = /<button id="winter-entry-lucia"[^>]*>(.*?)<\/button>/.exec(html)?.[1];
    expect(firstEntry).toContain("font-semibold");
    expect(firstEntry).toContain("truncate text-xs");
    expect(firstEntry).not.toContain("aria-label");
  });
});
