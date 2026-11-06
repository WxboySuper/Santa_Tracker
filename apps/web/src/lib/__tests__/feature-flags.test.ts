import { describe, expect, it, vi } from "vitest";
import { createFeatureFlagCache, DEFAULT_FEATURE_FLAGS, parseFeatureFlags } from "../feature-flags";

const active = JSON.stringify({ version: 1, hidden: { tracker: true, advent: false }, updatedAt: "2026-11-06T12:00:00.000Z" });

describe("feature flag parsing", () => {
  it("accepts a strict version 1 document", () => {
    expect(parseFeatureFlags(active)).toEqual({ version: 1, hidden: { tracker: true, advent: false }, updatedAt: "2026-11-06T12:00:00.000Z" });
  });

  it.each([null, "not json", "{}", JSON.stringify({ version: 2, hidden: { tracker: true, advent: false }, updatedAt: "2026-11-06T12:00:00Z" }), JSON.stringify({ version: 1, hidden: { tracker: 1, advent: false }, updatedAt: "2026-11-06T12:00:00Z" }), JSON.stringify({ version: 1, hidden: { tracker: false, advent: false, extra: true }, updatedAt: "2026-11-06T12:00:00Z" }), JSON.stringify({ version: 1, hidden: { tracker: false, advent: false }, updatedAt: "yesterday" }), JSON.stringify({ version: 1, hidden: { tracker: false, advent: false }, updatedAt: "2026-02-30T12:00:00Z" })])("treats malformed data as no flags: %s", raw => {
    expect(parseFeatureFlags(raw)).toEqual(DEFAULT_FEATURE_FLAGS);
  });
});

describe("feature flag cache", () => {
  it("uses an injected clock, refreshes after its short TTL, and coalesces reads", async () => {
    let current = 10_000;
    const read = vi.fn(async () => active);
    const cache = createFeatureFlagCache({ read }, () => current, 7_000);
    const [first, concurrent] = await Promise.all([cache.read(), cache.read()]);
    expect(first).toEqual(concurrent);
    expect(read).toHaveBeenCalledTimes(1);
    await cache.read();
    expect(read).toHaveBeenCalledTimes(1);
    current += 7_001;
    await cache.read();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps the last valid hide on storage failure and retries after the brief failure cache", async () => {
    let current = 1;
    let failing = false;
    const read = vi.fn(async () => {
      if (failing) throw new Error("storage offline");
      return active;
    });
    const cache = createFeatureFlagCache({ read }, () => current, 7_000);
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    failing = true;
    current += 7_001;
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    expect(read).toHaveBeenCalledTimes(2);
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    expect(read).toHaveBeenCalledTimes(2);
    current += 7_001;
    await cache.read();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("uses schedule defaults on a cold-start storage failure", async () => {
    const read = vi.fn(async () => { throw new Error("storage offline"); });
    const cache = createFeatureFlagCache({ read }, () => 1);
    expect(await cache.read()).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("keeps the last valid document when a later stored document is corrupt", async () => {
    let current = 1;
    let raw: string | null = active;
    const read = vi.fn(async () => raw);
    const cache = createFeatureFlagCache({ read }, () => current, 7_000);
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    raw = "{corrupt";
    current += 7_001;
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("uses schedule defaults when the flag document is missing", async () => {
    const read = vi.fn(async () => null);
    const cache = createFeatureFlagCache({ read }, () => 1);
    expect(await cache.read()).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("does not let an in-flight old read overwrite an invalidated flag value", async () => {
    let finishOldRead: (value: string) => void = () => undefined;
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { finishOldRead = resolve; }))
      .mockResolvedValueOnce(active);
    const cache = createFeatureFlagCache({ read }, () => 1);
    const oldRead = cache.read();
    cache.invalidate();
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
    finishOldRead(JSON.stringify({ version: 1, hidden: { tracker: false, advent: false }, updatedAt: "2026-11-06T12:00:00.000Z" }));
    await oldRead;
    expect(await cache.read()).toEqual(parseFeatureFlags(active));
  });
});
