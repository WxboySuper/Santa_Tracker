import { describe, expect, it } from "vitest";
import { draftConflictResponse } from "./route-draft-errors";

describe("route draft conflict responses", () => {
  it("returns current state and its ETag for stale revision operations", async () => {
    const current = { source: "draft", versionId: "revision-2", etag: '"revision-2"' };
    const response = draftConflictResponse({ status: 412, current });

    expect(response?.status).toBe(412);
    expect(response?.headers.get("etag")).toBe(current.etag);
    await expect(response?.json()).resolves.toMatchObject({ current });
  });

  it("ignores errors that are not draft conflicts", () => {
    expect(draftConflictResponse({ status: 404 })).toBeNull();
  });
});
