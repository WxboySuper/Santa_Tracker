import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { getEndpointForProject, getRuntimeConfig } from "./fixtures";
import { prepareFixtureData } from "./fixture-data";
import { getLocalAddress } from "./server-processes";

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
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-calendar-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temp");
  await mkdir(source, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  const calendarPath = path.join(source, "advent_calendar.json");
  try {
    await writeFile(path.join(source, "santa_route.json"), "{}");
    await writeFile(calendarPath, "{");
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("calendar shape errors include the source path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-calendar-shape-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temp");
  await mkdir(source, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  const calendarPath = path.join(source, "advent_calendar.json");
  try {
    await writeFile(path.join(source, "santa_route.json"), "{}");
    await writeFile(calendarPath, "{}");
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("calendar rejects malformed day entries with the source path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-calendar-day-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temp");
  await mkdir(source, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  const calendarPath = path.join(source, "advent_calendar.json");
  try {
    await writeFile(path.join(source, "santa_route.json"), "{}");
    await writeFile(calendarPath, JSON.stringify({ days: [null] }));
    await expect(prepareFixtureData(source, temporaryRoot)).rejects.toThrow(calendarPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture calendars clear source overrides and unlock only open day one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-calendar-override-test-"));
  const source = path.join(root, "source");
  const temporaryRoot = path.join(root, "temp");
  await mkdir(source, { recursive: true });
  await mkdir(temporaryRoot, { recursive: true });
  try {
    await writeFile(path.join(source, "santa_route.json"), "{}");
    await writeFile(path.join(source, "advent_calendar.json"), JSON.stringify({ days: [
      { day: 1, is_unlocked_override: false },
      { day: 2, is_unlocked_override: true },
    ] }));
    const roots = await prepareFixtureData(source, temporaryRoot);
    const closed = JSON.parse(await readFile(path.join(roots.closed, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    const open = JSON.parse(await readFile(path.join(roots.open, "advent_calendar.json"), "utf8")) as { days: { day: number; is_unlocked_override?: boolean }[] };
    expect(closed.days.some((day) => day.is_unlocked_override !== undefined)).toBe(false);
    expect(open.days).toEqual([{ day: 1, is_unlocked_override: true }, { day: 2 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
