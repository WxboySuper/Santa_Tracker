import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAdventCalendar, type AdventDay } from "../advent";
import { previewAdminAdventDays } from "../admin-advent";

vi.mock("../advent", async importOriginal => {
  const actual = await importOriginal<typeof import("../advent")>();
  return { ...actual, loadAdventCalendar: vi.fn() };
});

describe("admin Advent preview", () => {
  beforeEach(() => vi.mocked(loadAdventCalendar).mockReset());

  it("uses live overrides and omits payloads for locked preview days", async () => {
    const days: AdventDay[] = [
      {
        day: 1,
        title: "Force locked",
        unlock_time: "2026-12-01T00:00:00Z",
        content_type: "fact",
        payload: { text: "hidden" },
        is_unlocked_override: false,
      },
      {
        day: 2,
        title: "Force unlocked",
        unlock_time: "2026-12-03T00:00:00Z",
        content_type: "fact",
        payload: { text: "shown" },
        is_unlocked_override: true,
      },
    ];
    vi.mocked(loadAdventCalendar).mockResolvedValue(days);

    const result = await previewAdminAdventDays(new Date("2026-12-02T00:00:00Z"));
    const body = result.body as { days: Record<string, unknown>[] };

    expect(result.status).toBe(200);
    expect(body.days[0]).toMatchObject({ is_unlocked_at_preview_time: false, is_unlocked_override: false });
    expect(body.days[0]?.payload).toBeUndefined();
    expect(body.days[0]?.fallback_activity).toBeUndefined();
    expect(body.days[1]).toMatchObject({
      is_unlocked_at_preview_time: true,
      is_unlocked_override: true,
      payload: { text: "shown" },
      fallback_activity: { kind: "jigsaw", scene: "cabin", pieces: 12 },
    });
  });

  it("omits fallback previews when fallback activities are disabled", async () => {
    const previous = process.env.ADVENT_FALLBACKS_ENABLED;
    process.env.ADVENT_FALLBACKS_ENABLED = "False";
    vi.mocked(loadAdventCalendar).mockResolvedValue([{
      day: 2,
      title: "Open day",
      unlock_time: "2026-12-02T12:00:00Z",
      content_type: "fact",
      payload: { text: "The authored fact." },
    }]);

    try {
      const result = await previewAdminAdventDays(new Date("2026-12-25T00:00:00Z"));
      const body = result.body as { days: Record<string, unknown>[] };
      expect(body.days[0]).toMatchObject({ is_unlocked_at_preview_time: true, payload: { text: "The authored fact." } });
      expect(body.days[0]?.fallback_activity).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.ADVENT_FALLBACKS_ENABLED;
      else process.env.ADVENT_FALLBACKS_ENABLED = previous;
    }
  });
});
