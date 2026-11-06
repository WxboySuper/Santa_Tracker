import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { getEndpointForProject, getRuntimeConfig } from "./fixtures";
import { prepareFixtureData } from "./fixture-data";
import { getLocalAddress } from "./server-processes";

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
    await writeFile(path.join(source, "santa_route.json"), "{}");
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

const completeCalendarDays = Array.from({ length: 24 }, (_, index) => ({ day: index + 1 }));
const malformedCalendarDays: unknown[] = [...completeCalendarDays];
malformedCalendarDays[0] = null;
const outOfRangeCalendarDays = completeCalendarDays.map((day) => ({ ...day }));
outOfRangeCalendarDays[0] = { day: 25 };
const duplicateCalendarDays = completeCalendarDays.map((day) => ({ ...day }));
duplicateCalendarDays[1] = { day: 1 };

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

test("fixture calendars clear source overrides and unlock only open day one", async () => {
  const calendarDays = completeCalendarDays.map(({ day }) => {
    if (day === 1) return { day, is_unlocked_override: false };
    if (day === 2) return { day, is_unlocked_override: true };
    return { day };
  });
  const calendar = JSON.stringify({ days: calendarDays });
  await withCalendarFixture("calendar-override-test", calendar, async ({ source, temporaryRoot }) => {
    const roots = await prepareFixtureData({ source, temporaryRoot });
    const closed = JSON.parse(await readFile(path.join(roots.closed, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    const open = JSON.parse(await readFile(path.join(roots.open, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    expect(closed.days.some((day) => day.is_unlocked_override !== undefined)).toBe(false);
    expect(open.days[0]).toEqual({ day: 1, is_unlocked_override: true });
    expect(open.days.slice(1)).toEqual(completeCalendarDays.slice(1));
  });
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

test("server address parsing strips ANSI color and trailing punctuation", () => {
  const red = String.fromCharCode(27);
  expect(getLocalAddress(`Local: http://localhost:43171.${red}[0m`)).toBe("http://localhost:43171");
});

test("server address parsing converts a bind-all address into a local URL", () => {
  expect(getLocalAddress("Local: http://0.0.0.0:43171")).toBe("http://localhost:43171");
});

test.each(["[::]", "[0:0:0:0:0:0:0:0]"])("server address parsing converts IPv6 bind-all address %s", (host) => {
  expect(getLocalAddress(`Local: http://${host}:43171`)).toBe("http://localhost:43171");
});

test("server address parsing rejects non-loopback hostnames", () => {
  expect(getLocalAddress("Local: https://santa.local:43171")).toBeUndefined();
});

test("server address parsing ignores unrelated URLs outside the Local line", () => {
  expect(getLocalAddress("Telemetry: https://cdn.example.com:43171\nLocal: http://localhost:43172"))
    .toBe("http://localhost:43172");
});
