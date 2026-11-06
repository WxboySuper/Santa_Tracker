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
  await mkdir(source, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  await writeFile(path.join(source, "santa_route.json"), "{}");
  await writeFile(calendarPath, calendarContent);
  try {
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

test("runtime config rejects empty endpoints and credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-invalid-runtime-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, JSON.stringify({ endpoints: {}, adminPassword: "test-pass" }));
    await expect(getRuntimeConfig(runtimeFile)).rejects.toThrow(runtimeFile);
    await writeFile(runtimeFile, JSON.stringify({ endpoints: { closed: "http://localhost:3000" }, adminPassword: "" }));
    await expect(getRuntimeConfig(runtimeFile)).rejects.toThrow(runtimeFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime config requires both project endpoints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-incomplete-runtime-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, JSON.stringify({ endpoints: { closed: "http://localhost:3000" }, adminPassword: "test-pass" }));
    await expect(getRuntimeConfig(runtimeFile)).rejects.toThrow(runtimeFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("calendar parse errors include the source path", async () => {
  await withCalendarFixture("calendar-test", "{", async ({ source, temporaryRoot, calendarPath }) => {
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  });
});

test("calendar shape errors include the source path", async () => {
  await withCalendarFixture("calendar-shape-test", "{}", async ({ source, temporaryRoot, calendarPath }) => {
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  });
});

test("calendar rejects malformed day entries with the source path", async () => {
  await withCalendarFixture("calendar-day-test", JSON.stringify({ days: [null] }), async ({ source, temporaryRoot, calendarPath }) => {
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  });
});

test("fixture calendars clear source overrides and unlock only open day one", async () => {
  const calendar = JSON.stringify({ days: [
    { day: 1, is_unlocked_override: false },
    { day: 2, is_unlocked_override: true },
  ] });
  await withCalendarFixture("calendar-override-test", calendar, async ({ source, temporaryRoot }) => {
    const roots = await prepareFixtureData(source, temporaryRoot);
    const closed = JSON.parse(await readFile(path.join(roots.closed, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    const open = JSON.parse(await readFile(path.join(roots.open, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    expect(closed.days.some((day) => day.is_unlocked_override !== undefined)).toBe(false);
    expect(open.days).toEqual([{ day: 1, is_unlocked_override: true }, { day: 2 }]);
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

test("server address parsing accepts local hostnames", () => {
  expect(getLocalAddress("Local: https://santa.local:43171")).toBe("https://santa.local:43171");
});
