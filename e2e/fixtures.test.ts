import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { getEndpointForProject, getRuntimeConfig } from "./fixtures";
import { prepareFixtureData } from "./fixture-data";
import { openFirstDay } from "./calendar-validation";
import { getStartupFailure, waitForServers, type StartupResult } from "./server-processes";
import { isServerEndpointMap } from "./validation";

type CalendarFixture = { source: string; temporaryRoot: string; calendarPath: string };

async function withCalendarFixture(
  name: string,
  calendarContent: string,
  run: (fixture: CalendarFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), `santa-e2e-${name}-`));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temp");
  const calendarPath = path.join(source, "advent_calendar.json");
  try {
    await mkdir(source, { recursive: true });
    await mkdir(temporaryRoot, { recursive: true });
    await writeFile(path.join(source, "santa_route.json"), JSON.stringify({ meta: {}, route_nodes: [
      { schedule: { arrival_utc: "2026-12-24T20:00:00Z" } },
      { schedule: { departure_utc: "2026-12-25T02:00:00Z" } },
    ] }));
    await writeFile(calendarPath, calendarContent);
    await run({ source, temporaryRoot, calendarPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("runtime config parse errors include the file path and allow retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-fixture-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, "{");
    await expect(getRuntimeConfig(runtimeFile)).rejects.toThrow(runtimeFile);
    await writeFile(runtimeFile, JSON.stringify({ endpoints: {
      closed: "http://localhost:3000",
      open: "http://localhost:3001",
    }, adminPassword: "test-pass" }));
    await expect(getEndpointForProject(runtimeFile, "closed")).resolves.toBe("http://localhost:3000");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

type RuntimeValidationCase = { name: string; config: unknown; validateEndpoint: boolean };
const runtimeValidationCases: RuntimeValidationCase[] = [
  { name: "empty endpoints", config: { endpoints: {}, adminPassword: "test-pass" }, validateEndpoint: false },
  { name: "empty endpoint value", config: { endpoints: { closed: "", open: "http://localhost:3001" }, adminPassword: "test-pass" }, validateEndpoint: false },
  { name: "extra endpoint", config: { endpoints: { closed: "http://localhost:3000", open: "http://localhost:3001", spare: "http://localhost:3002" }, adminPassword: "test-pass" }, validateEndpoint: false },
  { name: "empty password", config: { endpoints: { closed: "http://localhost:3000", open: "http://localhost:3001" }, adminPassword: "" }, validateEndpoint: false },
  { name: "missing project endpoint", config: { endpoints: { closed: "http://localhost:3000" }, adminPassword: "test-pass" }, validateEndpoint: false },
  { name: "non-HTTP URL", config: { endpoints: { closed: "file:///tmp/site", open: "http://localhost:3001" }, adminPassword: "test-pass" }, validateEndpoint: true },
];

test.each(runtimeValidationCases)("runtime validation rejects $name with its file path", async ({ config, validateEndpoint }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-invalid-runtime-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, JSON.stringify(config));
    const validation = validateEndpoint
      ? getEndpointForProject(runtimeFile, "closed")
      : getRuntimeConfig(runtimeFile);
    await expect(validation).rejects.toThrow(runtimeFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const completeCalendarDays = Array.from({ length: 24 }, (_, index) => ({
	day: index + 1,
	title: `Day ${index + 1}`,
	unlock_time: `2026-12-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
	content_type: "fact",
	payload: { text: `Fact for day ${index + 1}` },
}));
const malformedCalendarDays: unknown[] = [...completeCalendarDays];
malformedCalendarDays[0] = null;
const outOfRangeCalendarDays = completeCalendarDays.map((day, index) => index === 0 ? { ...day, day: 25 } : day);
const duplicateCalendarDays = completeCalendarDays.map((day, index) => index === 1 ? { ...day, day: 1 } : day);
const missingCalendarFieldCases = ["title", "unlock_time", "content_type", "payload"].map((field) => {
	const firstDay = completeCalendarDays[0];
	if (!firstDay) throw new Error("Calendar test fixture must contain day 1");
	const day = Object.fromEntries(Object.entries(firstDay).filter(([key]) => key !== field));
	return [field, JSON.stringify({ days: [day, ...completeCalendarDays.slice(1)] })];
});

test.each([
  ["invalid JSON", "{"],
  ["missing days array", "{}"],
  ["malformed day entry", JSON.stringify({ days: malformedCalendarDays })],
  ["incomplete day set", JSON.stringify({ days: completeCalendarDays.slice(1) })],
  ["out-of-range day", JSON.stringify({ days: outOfRangeCalendarDays })],
  ["duplicate day", JSON.stringify({ days: duplicateCalendarDays })],
])("calendar reports its source path for %s", async (_name, calendarContent) => {
  await withCalendarFixture("calendar-invalid-test", calendarContent, async ({ source, temporaryRoot, calendarPath }) => {
    await expect(prepareFixtureData({ source, temporaryRoot })).rejects.toThrow(calendarPath);
  });
});

test.each(missingCalendarFieldCases)("calendar reports its source path when day 1 has no %s", async (_field, calendarContent) => {
	await withCalendarFixture("calendar-missing-field-test", calendarContent, async ({ source, temporaryRoot, calendarPath }) => {
		await expect(prepareFixtureData({ source, temporaryRoot })).rejects.toThrow(calendarPath);
	});
});

test("route JSON reports its source path before fixture servers start", async () => {
  await withCalendarFixture("route-invalid-test", JSON.stringify({ days: completeCalendarDays }), async ({ source, temporaryRoot }) => {
    const routePath = path.join(source, "santa_route.json");
    await writeFile(routePath, "{");
    await expect(prepareFixtureData({ source, temporaryRoot })).rejects.toThrow(routePath);
  });
});

test("route with an invalid shape reports its source path before fixture servers start", async () => {
	await withCalendarFixture("route-shape-test", JSON.stringify({ days: completeCalendarDays }), async ({ source, temporaryRoot }) => {
		const routePath = path.join(source, "santa_route.json");
		await writeFile(routePath, JSON.stringify({ route_nodes: [] }));
		await expect(prepareFixtureData({ source, temporaryRoot })).rejects.toThrow(routePath);
	});
});

test("open route fixtures fail when there are too few valid schedule timestamps", async () => {
	await withCalendarFixture("route-schedule-test", JSON.stringify({ days: completeCalendarDays }), async ({ source, temporaryRoot }) => {
		await writeFile(path.join(source, "santa_route.json"), JSON.stringify({ meta: {}, route_nodes: [{ schedule: { arrival_utc: "not-a-date" } }] }));
		await expect(prepareFixtureData({ source, temporaryRoot })).rejects.toThrow("Cannot center route: fewer than two valid schedule timestamps");
	});
});

test("fixture calendars clear source overrides and unlock only open day one", async () => {
  const calendarDays = completeCalendarDays.map((day) => {
    if (day.day === 1) return { ...day, is_unlocked_override: null };
    if (day.day === 2) return { ...day, unlock_time: "2000-01-01T00:00:00Z", is_unlocked_override: true };
    return day;
  });
  const calendar = JSON.stringify({ days: calendarDays });
  await withCalendarFixture("calendar-override-test", calendar, async ({ source, temporaryRoot }) => {
    const roots = await prepareFixtureData({ source, temporaryRoot });
    const closed = JSON.parse(await readFile(path.join(roots.closed, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    const open = JSON.parse(await readFile(path.join(roots.open, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean; unlock_time?: string }[] };
    expect(closed.days.some((day) => day.is_unlocked_override !== undefined)).toBe(false);
    expect(open.days[0]).toMatchObject({ day: 1, is_unlocked_override: true });
    expect(open.days.slice(1).every((day) => day.is_unlocked_override === false)).toBe(true);
    expect(open.days.find((day) => day.day === 2)?.unlock_time).toBe("2000-01-01T00:00:00Z");
  });
});

test("opening an invalid calendar reports a missing day one", () => {
  expect(() => openFirstDay({ days: [] })).toThrow("Advent calendar must contain day 1");
});

test("runtime endpoints are cached per file for each worker", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-fixture-cache-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, JSON.stringify({ endpoints: { closed: "http://localhost:3000", open: "http://localhost:3001" }, adminPassword: "test-pass" }));
    await expect(getEndpointForProject(runtimeFile, "closed")).resolves.toBe("http://localhost:3000");
    await expect(getEndpointForProject(runtimeFile, "open")).resolves.toBe("http://localhost:3001");
    await writeFile(runtimeFile, "{");
    await expect(getEndpointForProject(runtimeFile, "closed")).resolves.toBe("http://localhost:3000");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startup failure reports all failed server starts", () => {
  const failures: PromiseSettledResult<StartupResult>[] = [
    { status: "rejected", reason: new Error("closed server failed") },
    { status: "rejected", reason: "open server failed" },
  ];
  const failure = getStartupFailure(failures);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors.map((error: Error) => error.message)).toEqual([
    "closed server failed",
    "open server failed",
  ]);
});

test("server readiness requires both configured servers", async () => {
  await expect(waitForServers([])).rejects.toThrow("Both closed and open server endpoints must be available");
  expect(isServerEndpointMap({ closed: "http://localhost:3000" })).toBe(false);
});
