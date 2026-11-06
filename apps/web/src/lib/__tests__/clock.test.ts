import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTime } from "../clock";

describe("currentTime", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses a valid rehearsal instant outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_REHEARSAL_TIME", "2026-12-24T10:00:00.000Z");
    expect(currentTime().toISOString()).toBe("2026-12-24T10:00:00.000Z");
  });

  it("ignores the rehearsal instant in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_REHEARSAL_TIME", "2026-12-24T10:00:00.000Z");
    expect(currentTime().toISOString()).not.toBe("2026-12-24T10:00:00.000Z");
  });
});
