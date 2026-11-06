import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { getEndpointForProject, getRuntimeConfig } from "./fixtures";
import { getLocalAddress } from "./server-processes";

test("runtime endpoint parse errors include the file path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "santa-e2e-fixture-test-"));
  const runtimeFile = path.join(root, "endpoints.json");
  try {
    await writeFile(runtimeFile, "{");
    await expect(getRuntimeConfig(runtimeFile)).rejects.toThrow(runtimeFile);
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
