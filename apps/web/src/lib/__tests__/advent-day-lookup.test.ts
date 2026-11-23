import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminAdventDay } from "../admin-advent";
import { getDayContent, loadAdventCalendarDict, type AdventDay } from "../advent";

vi.mock("../config", () => ({ isAdventEnabled: vi.fn(() => true) }));
vi.mock("../advent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../advent")>();
  return { ...actual, loadAdventCalendarDict: vi.fn() };
});

const day: AdventDay = {
  day: 24,
  title: "Locked winter note",
  unlock_time: "2099-12-24T12:00:00Z",
  content_type: "fact",
  payload: { text: "This stays private until it opens.", nested: { clue: "north" } },
};

let temporaryRoot: string;
let calendarPath: string;

beforeEach(async () => {
  vi.mocked(loadAdventCalendarDict).mockReset();
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "advent-day-lookup-"));
  calendarPath = path.join(temporaryRoot, "calendar.json");
  await writeCalendar([day]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function writeCalendar(days: AdventDay[]): Promise<void> {
  await writeFile(calendarPath, JSON.stringify({ days }), "utf8");
}

describe("Advent day lookup regressions", () => {
  it("does not return a locked payload to public readers", async () => {
    const result = await getDayContent(24, { filePath: calendarPath, currentTime: new Date("2026-12-01T00:00:00Z") });
    expect(result).toMatchObject({ day: 24, title: "Locked winter note", is_unlocked: false });
    expect(result?.payload).toBeUndefined();
  });

  it("returns locked content to an authenticated admin reader", async () => {
    vi.mocked(loadAdventCalendarDict).mockResolvedValue(new Map([[day.day, structuredClone(day)]]));

    const result = await getAdminAdventDay("24");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      day: 24,
      is_currently_unlocked: false,
      payload: { text: "This stays private until it opens." },
    });
  });

  it("isolates public payload mutations from later reads", async () => {
    const options = { filePath: calendarPath, currentTime: new Date("2100-01-01T00:00:00Z") };
    const first = await getDayContent(24, options);
    expect(first?.payload).toBeDefined();
    (first!.payload!.nested as { clue: string }).clue = "changed";

    const second = await getDayContent(24, options);
    expect(second?.payload?.nested).toEqual({ clue: "north" });
  });

  it("uses one indexed lookup per day without array find scans", async () => {
    await writeCalendar(Array.from({ length: 24 }, (_, index) => ({
      day: index + 1,
      title: `Day ${index + 1}`,
      unlock_time: "2026-12-01T00:00:00Z",
      content_type: "fact" as const,
      payload: { text: `Note ${index + 1}` },
    })));
    const mapGet = vi.spyOn(Map.prototype, "get");
    const arrayFind = vi.spyOn(Array.prototype, "find");

    for (let number = 1; number <= 24; number += 1) {
      await getDayContent(number, { filePath: calendarPath, currentTime: new Date("2026-12-25T00:00:00Z") });
    }

    const indexedLookupCount = mapGet.mock.contexts.filter((context) => context instanceof Map && context.size === 24).length;
    expect(indexedLookupCount).toBe(24);
    expect(arrayFind).not.toHaveBeenCalled();
  });
});
