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
    expect(body.days[1]).toMatchObject({
      is_unlocked_at_preview_time: true,
      is_unlocked_override: true,
      payload: { text: "shown" },
    });
  });
});
