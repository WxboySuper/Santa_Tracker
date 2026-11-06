import { describe, expect, it } from "vitest";
import { createPostcardSave, layoutPostcard, parsePostcard, restorePostcardSave, sanitizePostcardText, wrapPostcardText } from "./postcard";

describe("postcard activity", () => {
  it("validates the optional scene", () => {
    expect(parsePostcard({ kind: "postcard" })).toEqual({ scene: "cabin" });
    expect(parsePostcard({ kind: "postcard", scene: "forest" })).toEqual({ scene: "forest" });
    expect(parsePostcard({ kind: "postcard", scene: "beach" })).toBeNull();
  });

  it("keeps plain unicode text and the 140 codepoint limit", () => {
    expect(sanitizePostcardText({ value: "  <b>Hello</b> friend  " })).toBe("Hello friend");
    expect(Array.from(sanitizePostcardText({ value: "🌲".repeat(150) })).length).toBe(140);
  });

  it("preserves ordinary angle brackets and turns control characters into spacing", () => {
    expect(sanitizePostcardText({ value: "Less than <3; five > three\nnext" })).toBe("Less than <3; five > three next");
  });

  it("wraps long words and emoji without dropping characters", () => {
    const message = "A very long word abcdefghijklmnopqrstuvwxyz 🌲 by the window";
    const lines = wrapPostcardText({ value: message, maxWidth: 180, fontSize: 20 });
    expect(lines.join("")).toContain("abcdefghijklmnopqrstuvwxyz");
    expect(lines.join(" ")).toContain("🌲");
    expect(lines.every((line) => Array.from(line).length > 0)).toBe(true);
  });

  it("lays out optional postmarks and restores sanitized save data", () => {
    expect(layoutPostcard({ greeting: "Good evening", signoff: "Warmly", city: "Duluth", date: "2026-12-23", includePostmark: true }).postmark).toEqual(["Duluth", "2026-12-23"]);
    expect(layoutPostcard({ greeting: "Good evening", signoff: "Warmly", city: "A city name long enough to wrap across multiple lines", date: "2026-12-23", includePostmark: true }).postmark.at(-1)).toBe("2026-12-23");
    const save = createPostcardSave({ payload: { scene: "cabin", greeting: "<b>Hello</b>", signoff: "Warmly", city: "", date: "", includePostmark: false } });
    expect(restorePostcardSave({ raw: JSON.stringify(save) })?.greeting).toBe("Hello");
    expect(restorePostcardSave({ raw: "{bad" })).toBeNull();
  });
});
